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
  "events": [ {"date": "<YYYY-MM-DD, always a full date; leading '-' for BCE, e.g. '1453-05-29', '-0216-08-02'>", "label": "<max 80 chars>", "type": "history"|"divergence"|"alt", "source": <citation number or null>} ],
  "figures": [ {"name": "...", "role": "<title or function>", "faction": "<power they serve>", "status": "dominant"|"rising"|"stable"|"declining"|"wounded"|"ill"|"dead"|"unknown", "realFate": "<what happened to them in real history, one sentence>", "altFate": "<what is happening to them here, one sentence>", "source": <citation number or null>} ],
  "powers": [ {"name": "...", "kind": "<empire|kingdom|republic|church|league|dynasty|company|movement>", "strength": <1-5>, "posture": "hegemon"|"expanding"|"emerging"|"consolidating"|"defensive"|"fracturing"|"collapsing"|"fallen", "interests": ["<strategic interest: what they want and why, max 90 chars>", ...], "relations": [ {"with": "<other power name>", "kind": "ally"|"rival"|"war"|"vassal"|"trade"|"neutral"} ]} ],
  "ledger": [ {"year": <int>, "ours": "<what happened in real history, max 100 chars>", "theirs": "<what happens in this timeline instead, max 100 chars>", "source": <citation number or null>} ],
  "flashpoints": ["<an open tension or decision point the user could explore next, phrased as a question, max 90 chars>", "...", "..."]
}`;

type Lang = "en" | "ko";

const LANGUAGE_RULE: Record<Lang, string> = {
  en: "",
  ko: `
LANGUAGE: Write everything the user reads in Korean (한국어): the prose, the subheadings, and every string VALUE in the JSON (event labels, figure roles, factions, real and alternate fates, power kinds, interests, ledger rows, flashpoints). Use standard Korean forms of names (e.g. 콘스탄티노폴리스, 메흐메트 2세, 구텐베르크). Narrate in literary written style (~했다/~이다); write the closing invitation in polite form (~해 보시겠습니까?). Keep JSON keys, enum values (type, status, posture, relation kind), dates, and citation markers like [1] exactly as specified, in English.
`,
};

const STATUS_TEXT: Record<Lang, { narrating: string; narratingSlow: string; dossier: string }> = {
  en: {
    narrating: "Narrating...",
    narratingSlow: "Narrating (the full reply arrives at once; a long chapter can take one to three minutes)...",
    dossier: "Updating the dossier...",
  },
  ko: {
    narrating: "서술하는 중...",
    narratingSlow: "서술하는 중 (전체 응답이 한 번에 도착합니다. 긴 장은 1~3분 걸릴 수 있습니다)...",
    dossier: "기록부를 갱신하는 중...",
  },
};

type Overrides = NonNullable<ChatRequest["scenario"]["overrides"]>;

function overrideBlock(o: Overrides | undefined): string {
  if (!o || (o.powers.length === 0 && o.figures.length === 0 && !o.factions?.length)) return "";
  const lines = [
    ...o.powers.map((p) => `- power "${p.name}": posture "${p.posture}"`),
    ...o.figures.map((f) => `- figure "${f.name}": status "${f.status}"`),
    ...(o.factions ?? []).map((f) => `- figure "${f.name}": faction "${f.faction || "none"}"`),
  ];
  return `\nSTATES SET BY THE USER — these are facts of this world now. Keep them in the JSON and let the narrative follow from them, unless the user's own message clearly changes them:\n${lines.join("\n")}\n`;
}

function buildSystemPrompt(
  g: Grounding,
  renames: { from: string; to: string }[],
  lang: Lang,
  overrides?: Overrides
): string {
  // Sized from measured gateway numbers: Opus's output_tokens include hidden
  // reasoning, so visible English costs ~0.5 tokens/char and Korean ~1.6
  // tokens/char; the proxy drops replies after ~100 s at ~58 tokens/s. Targets
  // keep prose + JSON near 4,500 tokens with max_tokens 6000 as the guard.
  const lengthTarget =
    lang === "ko" ? "about 1,000 to 1,200 Korean characters (공백 제외 기준)" : "about 800 to 1,000 words";
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
${renameBlock}${overrideBlock(overrides)}${LANGUAGE_RULE[lang]}
VERIFIED SOURCES — real history, from Wikipedia. Anything before the point of divergence must agree with these:
${sourceBlock}

RULES
1. Real history before the divergence: verify it against the sources above and cite them inline as [1], [2], etc. If a source contradicts what you were about to say, follow the source. If a pre-divergence detail is not covered by any source, say so briefly ("the record is thin here") rather than inventing specifics.
2. Everything after the divergence is speculation. Make it plausible, grounded in the real conditions the sources describe, and consistent with earlier turns and with the dossier you have already built. Never cite a source for a speculative event. The divergence changes only what follows it: anyone who died, and anything that ended, before the point of divergence stays that way unless the divergence itself is what saved them.
3. Think in terms of actors and interests: who gains, who loses, what each power wants and what it can afford. Let consequences follow from those pressures rather than from coincidence.
4. Write vivid, substantial prose of ${lengthTarget}, organised under 3 to 5 short subheadings. Each subheading is a markdown "### " line of 2 to 5 words naming that section's theme or phase (for example "### The walls hold", "### Rome's dilemma", "### Winter of 1454"), followed by two to four paragraphs. Cover the immediate aftermath, then the reactions of each major power and figure, then the slower consequences: institutions, trade, religion, ideas, ordinary life. Use bold for key names; use lists sparingly; no other heading levels. HARD LIMIT: the reply is cut off at a fixed size, and the JSON comes last, so prose that runs long destroys the dossier. Stop the prose at the target length even mid-thought if necessary; the JSON must always be complete. Finish with a single closing sentence in plain prose, under the last subheading, that invites the user to push the scenario further (no "Hook:" label, no heading of its own).
5. After the prose, on its own line, write exactly ${STATE_DELIMITER} and then ONE JSON object with this shape:
${STATE_SCHEMA}
Guidance for the JSON:
- events: 4 to 6 NEW dated events introduced in this reply; never repeat events already on the timeline. EVERY event needs a full date, YYYY-MM-DD, never a bare year. Real events: the day recorded by the sources or well-established history; only if the record gives no day, fall back to YYYY-MM. Speculative events: you are writing this history, so commit to a specific, plausible day consistent with the narrative, the season (campaigns in summer, councils and coronations on feast days, sailings in spring), and the events around it; do not present it as documented. Use "history" for real pre-divergence events (with a source), "divergence" for the change itself (once, in the first reply), and "alt" for speculative consequences.
- figures: 3 to 5 people who matter in this reply. Every power in the powers list must be represented by at least one figure in the dossier: the first time a power appears (including outside powers such as a patron state or a distant empire), list the person actually deciding its policy toward this crisis, e.g. a head of government, a general secretary, a foreign minister, or a theatre commander, so the dossier never shows a power with no people behind it. Re-list a figure only if their status or altFate changed; a re-listed figure replaces the earlier entry, so reuse EXACTLY the name string used before (no added titles, epithets, or "of X"); never create a second entry for a person already in the dossier. realFate must match the sources when covered. Status runs "dominant" (unchallenged in their sphere; rare), "rising", "stable", "declining", "wounded" (physically hurt, outcome open), "ill" (sick or failing in health), "dead", "unknown". faction is the power they serve, spelled exactly as that power's name in the powers list, so figures group under it.
- powers: 3 to 4 powers active in this reply; each entry is that power's CURRENT full state (2 to 4 interests, relations to other named powers) and replaces any earlier entry for the same name. Posture runs from "hegemon" (unchallenged dominance over its world, rare: at most one power at a time) through expanding, emerging, consolidating, defensive, fracturing, collapsing, to "fallen" (the power has ceased to exist: conquered, partitioned, or dissolved). When a power falls, list it once more with posture "fallen", strength 1, and interests describing what its remnants or successors want; it then stays fallen unless the story explicitly restores it.
- ledger: 2 to 3 rows contrasting real history with this timeline at specific years.
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

const POSTURES = ["hegemon", "expanding", "emerging", "consolidating", "defensive", "fracturing", "collapsing", "fallen"] as const;
const STATUSES = ["dominant", "rising", "stable", "declining", "wounded", "ill", "dead", "unknown"] as const;

function sanitizeOverrides(raw: unknown): Overrides | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as { powers?: unknown; figures?: unknown };
  const powers = (Array.isArray(r.powers) ? r.powers : [])
    .filter((p) => p && typeof p.name === "string" && (POSTURES as readonly string[]).includes(p.posture))
    .map((p) => ({ name: String(p.name).slice(0, 80), posture: p.posture as (typeof POSTURES)[number] }))
    .slice(0, 40);
  const figures = (Array.isArray(r.figures) ? r.figures : [])
    .filter((f) => f && typeof f.name === "string" && (STATUSES as readonly string[]).includes(f.status))
    .map((f) => ({ name: String(f.name).slice(0, 80), status: f.status as (typeof STATUSES)[number] }))
    .slice(0, 40);
  const factions = (Array.isArray((r as { factions?: unknown }).factions) ? ((r as { factions: unknown[] }).factions as Record<string, unknown>[]) : [])
    .filter((f) => f && typeof f.name === "string" && typeof f.faction === "string")
    .map((f) => ({ name: String(f.name).slice(0, 80), faction: String(f.faction).slice(0, 80) }))
    .slice(0, 40);
  return powers.length || figures.length || factions.length ? { powers, figures, factions } : undefined;
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
    u.events = u.events.slice(0, 10);
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
        status: oneOf(f.status, STATUSES, "unknown"),
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
          ["hegemon", "expanding", "emerging", "consolidating", "defensive", "fracturing", "collapsing", "fallen"] as const,
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
    overrides: sanitizeOverrides(body?.scenario?.overrides),
  };

  const latestUser = messages[messages.length - 1].content;
  const lang: Lang = body?.lang === "ko" ? "ko" : "en";
  const statusText = STATUS_TEXT[lang];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: StreamEvent) => controller.enqueue(sse(ev));
      try {
        const grounding = await groundTurn(meta, latestUser, (text) => send({ type: "status", text }), lang);
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
          text: supportsStreaming() ? statusText.narrating : statusText.narratingSlow,
        });

        const upstreamMessages: LlmMessage[] = [
          { role: "system", content: buildSystemPrompt(grounding, meta.renames, lang, meta.overrides) },
          ...messages.map((m) => ({
            role: m.role,
            content: m.role === "assistant" ? serializeAssistant(m) : m.content,
          })),
        ];

        const splitter = new DelimiterSplitter(STATE_DELIMITER);
        let upstreamError: string | null = null;
        try {
          // The gateway accepts up to 8192, but its proxy drops replies that take
          // longer than ~100 s (HTTP 524). At ~58 tokens/s on Opus, 6000 keeps a
          // runaway reply truncated (and salvaged) instead of lost.
          for await (const delta of llmStream(upstreamMessages, { signal: req.signal, maxTokens: 6000 })) {
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

        send({ type: "status", text: statusText.dossier });
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
