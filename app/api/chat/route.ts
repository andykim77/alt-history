import { NextRequest } from "next/server";
import { groundTurn, type Grounding } from "@/lib/grounding";
import { extractJsonArray, streamCompletion, type OpenRouterMessage } from "@/lib/openrouter";
import {
  TIMELINE_DELIMITER,
  type ApiMessage,
  type ChatRequest,
  type Source,
  type StreamEvent,
  type TimelineEvent,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// ---------- prompt ----------

function yearLabel(y: number | null): string {
  if (y === null) return "unknown year";
  return y < 0 ? `${-y} BCE` : `${y} CE`;
}

function buildSystemPrompt(g: Grounding): string {
  const sourceBlock =
    g.pages.length === 0
      ? "(No sources could be retrieved for this turn. Be explicit about uncertainty for pre-divergence claims.)"
      : g.pages.map((p, i) => `[${i + 1}] ${p.title} — ${p.url}\n${p.extract}`).join("\n\n");

  return `You are the narrator of an interactive alternate-history exploration.

SCENARIO: ${g.title}
POINT OF DIVERGENCE: ${g.divergence} (${yearLabel(g.divergenceYear)})

VERIFIED SOURCES — real history, from Wikipedia. Anything before the point of divergence must agree with these:
${sourceBlock}

RULES
1. Real history before the divergence: verify it against the sources above and cite them inline as [1], [2], etc. If a source contradicts what you were about to say, follow the source. If a pre-divergence detail is not covered by any source, say so briefly ("the record is thin here") rather than inventing specifics.
2. Everything after the divergence is speculation. Make it plausible, grounded in the real conditions the sources describe, and consistent with earlier turns. Never cite a source for a speculative event.
3. Write vivid prose, 2 to 4 short paragraphs. Markdown is allowed (bold for key names, occasional lists). Finish with a single closing sentence or question that invites the user to push the scenario further, written as plain prose (no "Hook:" label, no heading).
4. After the prose, on its own line, write exactly ${TIMELINE_DELIMITER} and then a JSON array of 3 to 6 NEW dated events introduced in this reply. Do not repeat events already on the timeline. Each item: {"year": <integer, negative for BCE>, "label": "<max 80 chars>", "type": "history" | "divergence" | "alt", "source": <citation number or null>}. Use "history" for real pre-divergence events (with a source), "divergence" for the change itself (once, in the first reply), and "alt" for speculative consequences. Output nothing after the JSON.`;
}

function serializeAssistant(m: ApiMessage): string {
  if (!m.events || m.events.length === 0) return m.content;
  return `${m.content}\n\n${TIMELINE_DELIMITER}\n${JSON.stringify(m.events)}`;
}

function sanitizeMessages(raw: unknown): ApiMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ApiMessage[] = [];
  for (const m of raw) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;
    const events = Array.isArray(m.events) ? (m.events as TimelineEvent[]).slice(0, 40) : undefined;
    out.push({ role: m.role, content: m.content.slice(0, 8000), events });
  }
  if (out[out.length - 1].role !== "user") return null;
  return out.slice(-24);
}

function parseEvents(raw: string, sourceCount: number): TimelineEvent[] {
  const arr = extractJsonArray<Record<string, unknown>>(raw) ?? [];
  const out: TimelineEvent[] = [];
  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    const year = typeof e.year === "number" ? Math.trunc(e.year) : parseInt(String(e.year), 10);
    const label = typeof e.label === "string" ? e.label.trim().slice(0, 120) : "";
    if (!Number.isFinite(year) || !label) continue;
    const type = e.type === "history" || e.type === "divergence" || e.type === "alt" ? e.type : "alt";
    const src = typeof e.source === "number" && e.source >= 1 && e.source <= sourceCount ? e.source : null;
    out.push({ year, label, type, source: type === "alt" ? null : src });
  }
  return out.slice(0, 8);
}

// ---------- SSE plumbing ----------

const encoder = new TextEncoder();
const sse = (ev: StreamEvent) => encoder.encode(`data: ${JSON.stringify(ev)}\n\n`);

/**
 * Forwards prose deltas while holding back any suffix that could be the start of
 * the timeline delimiter. Once the delimiter is seen, everything after it is
 * collected as the timeline payload instead of forwarded.
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
    // Hold back the longest suffix of pending that is a prefix of the delimiter.
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

  /** Flush at end of stream. Returns any prose still held back. */
  flush(): string {
    const rest = this.collecting ? "" : this.pending;
    this.pending = "";
    return rest;
  }

  get timelineRaw(): string {
    return this.tail;
  }
}

async function pumpUpstream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
  onError: (msg: string) => void
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const parsed = JSON.parse(payload);
        if (parsed.error) {
          onError(parsed.error.message || JSON.stringify(parsed.error));
          return;
        }
        const delta = parsed.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) onDelta(delta);
      } catch {
        // Ignore malformed chunks.
      }
    }
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
        });
        const sources: Source[] = grounding.pages.map((p, i) => ({
          n: i + 1,
          title: p.title,
          url: p.url,
          snippet: p.extract.slice(0, 240).replace(/\s+/g, " ").trim(),
        }));
        send({ type: "sources", sources });
        send({ type: "status", text: "Narrating..." });

        const upstreamMessages: OpenRouterMessage[] = [
          { role: "system", content: buildSystemPrompt(grounding) },
          ...messages.map((m) => ({
            role: m.role,
            content: m.role === "assistant" ? serializeAssistant(m) : m.content,
          })),
        ];

        const upstream = await streamCompletion(upstreamMessages, { signal: req.signal });
        const splitter = new DelimiterSplitter(TIMELINE_DELIMITER);
        let upstreamError: string | null = null;
        await pumpUpstream(
          upstream,
          (delta) => {
            const prose = splitter.push(delta);
            if (prose) send({ type: "delta", text: prose });
          },
          (msg) => {
            upstreamError = msg;
          }
        );
        const rest = splitter.flush();
        if (rest) send({ type: "delta", text: rest });
        if (upstreamError) send({ type: "error", message: upstreamError });

        const events = parseEvents(splitter.timelineRaw, sources.length);
        send({ type: "events", events });
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
