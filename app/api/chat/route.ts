import { NextRequest } from "next/server";
import { groundTurn, type Grounding } from "@/lib/grounding";
import { extractJsonObject } from "@/lib/openrouter";
import { engineLabel, stream as llmStream, supportsStreaming, type LlmMessage } from "@/lib/llm";
import {
  STATE_DELIMITER,
  emptyUpdate,
  parseEventDate,
  type ApiMessage,
  type ChatRequest,
  type Figure,
  type LedgerEntry,
  type Power,
  type Source,
  type StreamEvent,
  type TimelineEvent,
  type WorldUpdate,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// ---------- prompt ----------

function yearLabel(y: number | null): string {
  if (y === null) return "unknown year";
  return y < 0 ? `${-y} BCE` : `${y} CE`;
}

const STATE_SCHEMA = `{
  "events": [ {"date": "<YYYY-MM-DD, YYYY-MM or YYYY; leading '-' for BCE, e.g. '1453-05-29', '1347-10', '-0216'>", "label": "<max 80 chars>", "type": "history"|"divergence"|"alt", "source": <citation number or null>} ],
  "figures": [ {"name": "...", "role": "<title or function>", "faction": "<power they serve>", "status": "rising"|"stable"|"declining"|"dead"|"unknown", "realFate": "<what happened to them in real history, one sentence>", "altFate": "<what is happening to them here, one sentence>", "source": <citation number or null>} ],
  "powers": [ {"name": "...", "kind": "<empire|kingdom|republic|church|league|dynasty|company|movement>", "strength": <1-5>, "posture": "expanding"|"consolidating"|"defensive"|"fracturing"|"collapsing"|"emerging", "interests": ["<strategic interest: what they want and why, max 90 chars>", ...], "relations": [ {"with": "<other power name>", "kind": "ally"|"rival"|"war"|"vassal"|"trade"|"neutral"} ]} ],
  "ledger": [ {"year": <int>, "ours": "<what happened in real history, max 100 chars>", "theirs": "<what happens in this timeline instead, max 100 chars>", "source": <citation number or null>} ],
  "flashpoints": ["<an open tension or decision point the user could explore next, phrased as a question, max 90 chars>", "...", "..."]
}`;

function buildSystemPrompt(g: Grounding, renames: { from: string; to: string }[]): string {
  const sourceBlock =
    g.pages.length === 0
      ? "(No sources could be retrieved for this turn. Be explicit about uncertainty for pre-divergence claims.)"
      : g.pages.map((p, i) => `[${i + 1}] ${p.title} — ${p.url}\n${p.extract}`).join("\n\n");
  const renameBlock =
    renames.length === 0
      ? ""
      : `\nNAMES CHOSEN BY THE USER — always use the right-hand form for these figures and powers, in prose and in the JSON:\n${renames
          .map((r) => `- "${r.from}" → "${r.to}"`)
          .join("\n")}\n`;

  return `You are the narrator and archivist of an interactive alternate-history exploration. Besides narrating, you maintain a structured dossier of the world: its timeline, key figures, powers and their strategic interests, and a ledger of what changed versus real history.

SCENARIO: ${g.title}
POINT OF DIVERGENCE: ${g.divergence} (${yearLabel(g.divergenceYear)})
${renameBlock}
VERIFIED SOURCES — real history, from Wikipedia. Anything before the point of divergence must agree with these:
${sourceBlock}

RULES
1. Real history before the divergence: verify it against the sources above and cite them inline as [1], [2], etc. If a source contradicts what you were about to say, follow the source. If a pre-divergence detail is not covered by any source, say so briefly ("the record is thin here") rather than inventing specifics.
2. Everything after the divergence is speculation. Make it plausible, grounded in the real conditions the sources describe, and consistent with earlier turns and with the dossier you have already built. Never cite a source for a speculative event. The divergence changes only what follows it: anyone who died, and anything that ended, before the point of divergence stays that way unless the divergence itself is what saved them.
3. Think in terms of actors and interests: who gains, who loses, what each power wants and what it can afford. Let consequences follow from those pressures rather than from coincidence.
4. Write vivid prose, 2 to 4 short paragraphs and no more than about 350 words. Markdown is allowed (bold for key names, occasional lists) but do not use headings. Keep the JSON that follows compact; the prose and the JSON must both fit comfortably in one reply. Finish with a single closing sentence in plain prose that invites the user to push the scenario further (no "Hook:" label, no heading).
5. After the prose, on its own line, write exactly ${STATE_DELIMITER} and then ONE JSON object with this shape:
${STATE_SCHEMA}
Guidance for the JSON:
- events: 3 to 6 NEW dated events introduced in this reply; never repeat events already on the timeline. Give the most precise date you can justify: real events get the day and month when the sources or well-established history record them; speculative events may carry a month or day when the narrative fixes one, otherwise year only. Never invent a day to look precise. Use "history" for real pre-divergence events (with a source), "divergence" for the change itself (once, in the first reply), and "alt" for speculative consequences.
- figures: 2 to 4 people who matter in this reply. Re-list a figure only if their status or altFate changed; a re-listed figure replaces the earlier entry. realFate must match the sources when covered.
- powers: 2 to 4 powers active in this reply; each entry is that power's CURRENT full state (2 to 4 interests, relations to other named powers) and replaces any earlier entry for the same name.
- ledger: 1 to 3 rows contrasting real history with this timeline at specific years.
- flashpoints: exactly 3 open tensions the user could explore next.
Output nothing after the JSON.`;
}

function serializeAssistant(m: ApiMessage): string {
  const u = m.update;
  if (!u) return m.content;
  const hasContent =
    u.events.length || u.figures.length || u.powers.length || u.ledger.length || u.flashpoints.length;
  if (!hasContent) return m.content;
  return `${m.content}\n\n${STATE_DELIMITER}\n${JSON.stringify(u)}`;
}

function sanitizeMessages(raw: unknown): ApiMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ApiMessage[] = [];
  for (const m of raw) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;
    const update = m.update && typeof m.update === "object" ? sanitizeUpdate(m.update, 99) : undefined;
    out.push({ role: m.role, content: m.content.slice(0, 8000), update });
  }
  if (out[out.length - 1].role !== "user") return null;
  return out.slice(-24);
}

// ---------- structured output parsing ----------

const asStr = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const asInt = (v: unknown) => {
  const n = typeof v === "number" ? Math.trunc(v) : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

function citation(v: unknown, sourceCount: number): number | null {
  const n = asInt(v);
  return n !== null && n >= 1 && n <= sourceCount ? n : null;
}

function sanitizeUpdate(raw: unknown, sourceCount: number): WorldUpdate {
  const u = emptyUpdate();
  if (!raw || typeof raw !== "object") return u;
  const r = raw as Record<string, unknown>;

  if (Array.isArray(r.events)) {
    for (const e of r.events as Record<string, unknown>[]) {
      if (!e || typeof e !== "object") continue;
      const when = parseEventDate(e.date ?? e.year);
      const label = asStr(e.label, 120);
      if (!when || !label) continue;
      const type = oneOf(e.type, ["history", "divergence", "alt"] as const, "alt");
      const ev: TimelineEvent = {
        year: when.year,
        month: when.month,
        day: when.day,
        label,
        type,
        source: type === "alt" ? null : citation(e.source, sourceCount),
      };
      u.events.push(ev);
    }
    u.events = u.events.slice(0, 8);
  }

  if (Array.isArray(r.figures)) {
    for (const f of r.figures as Record<string, unknown>[]) {
      if (!f || typeof f !== "object") continue;
      const name = asStr(f.name, 80);
      if (!name) continue;
      const fig: Figure = {
        name,
        role: asStr(f.role, 100),
        faction: asStr(f.faction, 80),
        status: oneOf(f.status, ["rising", "stable", "declining", "dead", "unknown"] as const, "unknown"),
        realFate: asStr(f.realFate, 240),
        altFate: asStr(f.altFate, 240),
        source: citation(f.source, sourceCount),
      };
      u.figures.push(fig);
    }
    u.figures = u.figures.slice(0, 6);
  }

  if (Array.isArray(r.powers)) {
    for (const p of r.powers as Record<string, unknown>[]) {
      if (!p || typeof p !== "object") continue;
      const name = asStr(p.name, 80);
      if (!name) continue;
      const strengthRaw = asInt(p.strength) ?? 3;
      const relationsRaw = Array.isArray(p.relations) ? (p.relations as Record<string, unknown>[]) : [];
      const pow: Power = {
        name,
        kind: asStr(p.kind, 40),
        strength: Math.min(5, Math.max(1, strengthRaw)),
        posture: oneOf(
          p.posture,
          ["expanding", "consolidating", "defensive", "fracturing", "collapsing", "emerging"] as const,
          "consolidating"
        ),
        interests: (Array.isArray(p.interests) ? p.interests : [])
          .map((s) => asStr(s, 140))
          .filter(Boolean)
          .slice(0, 5),
        relations: relationsRaw
          .filter((x) => x && typeof x === "object")
          .map((x) => ({
            with: asStr(x.with, 80),
            kind: oneOf(x.kind, ["ally", "rival", "war", "vassal", "trade", "neutral"] as const, "neutral"),
          }))
          .filter((x) => x.with)
          .slice(0, 6),
      };
      u.powers.push(pow);
    }
    u.powers = u.powers.slice(0, 6);
  }

  if (Array.isArray(r.ledger)) {
    for (const l of r.ledger as Record<string, unknown>[]) {
      if (!l || typeof l !== "object") continue;
      const year = asInt(l.year);
      const ours = asStr(l.ours, 160);
      const theirs = asStr(l.theirs, 160);
      if (year === null || !ours || !theirs) continue;
      const row: LedgerEntry = { year, ours, theirs, source: citation(l.source, sourceCount) };
      u.ledger.push(row);
    }
    u.ledger = u.ledger.slice(0, 5);
  }

  if (Array.isArray(r.flashpoints)) {
    u.flashpoints = (r.flashpoints as unknown[]).map((s) => asStr(s, 140)).filter(Boolean).slice(0, 3);
  }
  return u;
}

function parseUpdate(raw: string, sourceCount: number): WorldUpdate {
  const obj = extractJsonObject<Record<string, unknown>>(raw);
  if (obj) return sanitizeUpdate(obj, sourceCount);
  // The object failed to parse (usually truncated by the token limit): salvage
  // whichever top-level arrays are complete.
  const salvaged: Record<string, unknown> = {};
  for (const key of ["events", "figures", "powers", "ledger", "flashpoints"]) {
    const arr = salvageArray(raw, key);
    if (arr) salvaged[key] = arr;
  }
  console.warn(
    `[dossier] world-state JSON did not parse (${raw.length} chars); salvaged: ${Object.keys(salvaged).join(",") || "nothing"}; tail: ${JSON.stringify(raw.slice(-80))}`
  );
  if (Object.keys(salvaged).length > 0) return sanitizeUpdate(salvaged, sourceCount);
  // Tolerate a bare events array (older format).
  if (raw.indexOf("[") >= 0) return sanitizeUpdate({ events: safeArray(raw) }, sourceCount);
  return emptyUpdate();
}

/** Find `"key": [ ... ]` and return the array if its brackets balance and it parses. */
function salvageArray(raw: string, key: string): unknown[] | null {
  const m = new RegExp(`"${key}"\\s*:\\s*\\[`).exec(raw);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) {
        try {
          const v = JSON.parse(raw.slice(start, i + 1));
          return Array.isArray(v) ? v : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function safeArray(raw: string): unknown[] {
  const s = raw.indexOf("[");
  const e = raw.lastIndexOf("]");
  if (s < 0 || e <= s) return [];
  try {
    const v = JSON.parse(raw.slice(s, e + 1));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// ---------- SSE plumbing ----------

const encoder = new TextEncoder();
const sse = (ev: StreamEvent) => encoder.encode(`data: ${JSON.stringify(ev)}\n\n`);

/**
 * Forwards prose deltas while holding back any suffix that could be the start of
 * the state delimiter. Once the delimiter is seen, everything after it is
 * collected as the structured payload instead of forwarded.
 */
class DelimiterSplitter {
  private pending = "";
  private tail = "";
  private collecting = false;

  constructor(private readonly delimiter: string) {}

  push(delta: string): string {
    if (this.collecting) {
      this.tail += delta;
      return "";
    }
    this.pending += delta;
    const idx = this.pending.indexOf(this.delimiter);
    if (idx >= 0) {
      const prose = this.pending.slice(0, idx);
      this.tail = this.pending.slice(idx + this.delimiter.length);
      this.pending = "";
      this.collecting = true;
      return prose;
    }
    let hold = 0;
    const max = Math.min(this.delimiter.length - 1, this.pending.length);
    for (let k = max; k > 0; k--) {
      if (this.delimiter.startsWith(this.pending.slice(-k))) {
        hold = k;
        break;
      }
    }
    const emit = this.pending.slice(0, this.pending.length - hold);
    this.pending = this.pending.slice(this.pending.length - hold);
    return emit;
  }

  flush(): string {
    const rest = this.collecting ? "" : this.pending;
    this.pending = "";
    return rest;
  }

  get structuredRaw(): string {
    return this.tail;
  }
}

// ---------- handler ----------

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Partial<ChatRequest> | null;
  const messages = sanitizeMessages(body?.messages);
  if (!messages) {
    return Response.json({ error: "Missing or malformed messages." }, { status: 400 });
  }
  const meta = {
    title: typeof body?.scenario?.title === "string" ? body.scenario.title : undefined,
    divergence: typeof body?.scenario?.divergence === "string" ? body.scenario.divergence : undefined,
    divergenceYear:
      typeof body?.scenario?.divergenceYear === "number" ? body.scenario.divergenceYear : null,
    sourceTitles: Array.isArray(body?.scenario?.sourceTitles)
      ? body!.scenario!.sourceTitles.filter((t): t is string => typeof t === "string").slice(0, 8)
      : [],
    renames: (Array.isArray(body?.scenario?.renames) ? body!.scenario!.renames : [])
      .filter((r) => r && typeof r.from === "string" && typeof r.to === "string" && r.from !== r.to)
      .map((r) => ({ from: r.from.slice(0, 80), to: r.to.slice(0, 80) }))
      .slice(0, 40),
  };

  const latestUser = messages[messages.length - 1].content;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: StreamEvent) => controller.enqueue(sse(ev));
      try {
        const grounding = await groundTurn(meta, latestUser, (text) => send({ type: "status", text }));
        send({
          type: "meta",
          title: grounding.title,
          divergence: grounding.divergence,
          divergenceYear: grounding.divergenceYear,
          engine: engineLabel(),
        });
        const sources: Source[] = grounding.pages.map((p, i) => ({
          n: i + 1,
          title: p.title,
          url: p.url,
          snippet: p.extract.slice(0, 240).replace(/\s+/g, " ").trim(),
        }));
        send({ type: "sources", sources });
        send({
          type: "status",
          text: supportsStreaming() ? "Narrating..." : "Narrating (the full reply arrives at once, 15 to 40 seconds)...",
        });

        const upstreamMessages: LlmMessage[] = [
          { role: "system", content: buildSystemPrompt(grounding, meta.renames) },
          ...messages.map((m) => ({
            role: m.role,
            content: m.role === "assistant" ? serializeAssistant(m) : m.content,
          })),
        ];

        const splitter = new DelimiterSplitter(STATE_DELIMITER);
        let upstreamError: string | null = null;
        try {
          for await (const delta of llmStream(upstreamMessages, { signal: req.signal, maxTokens: 8000 })) {
            const prose = splitter.push(delta);
            if (prose) send({ type: "delta", text: prose });
          }
        } catch (err) {
          if (req.signal.aborted) throw err;
          upstreamError = err instanceof Error ? err.message : "The model call failed.";
        }
        const rest = splitter.flush();
        if (rest) send({ type: "delta", text: rest });
        if (upstreamError) send({ type: "error", message: upstreamError });

        send({ type: "status", text: "Updating the dossier..." });
        const update = parseUpdate(splitter.structuredRaw, sources.length);
        send({ type: "update", update });
        send({ type: "done" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        if (!req.signal.aborted) send({ type: "error", message });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
