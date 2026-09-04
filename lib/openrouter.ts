// Thin OpenRouter helpers shared by the grounding step and the streaming narrator.

export const DEFAULT_MODEL = "minimax/minimax-m3:free";

export function openRouterConfig() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Server is missing OPENROUTER_API_KEY.");
  return {
    apiKey,
    model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      // Used by OpenRouter for free-tier usage attribution.
      "HTTP-Referer": process.env.SITE_URL || "http://localhost:3000",
      "X-Title": "Alt History Explorer",
    },
  };
}

export type OpenRouterMessage = { role: "system" | "user" | "assistant"; content: string };

/** Human-readable message for a failed upstream response. */
export async function describeUpstreamError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  let detail: string = text;
  try {
    const j = JSON.parse(text);
    detail = j?.error?.message || j?.error || text;
  } catch {
    // keep raw text
  }
  if (res.status === 429) {
    return `Rate limited by OpenRouter's free tier (${detail || "try again in a minute"}).`;
  }
  if (res.status === 404) {
    return `Model not available (${detail}). Check OPENROUTER_MODEL against https://openrouter.ai/models?max_price=0.`;
  }
  return `OpenRouter error ${res.status}: ${String(detail).slice(0, 300)}`;
}

type CompletionOpts = { maxTokens?: number; temperature?: number; signal?: AbortSignal };

/** Non-streaming completion. Returns the assistant text. */
export async function complete(messages: OpenRouterMessage[], opts: CompletionOpts = {}): Promise<string> {
  const { model, headers } = openRouterConfig();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
    signal: opts.signal,
    body: JSON.stringify({
      model,
      stream: false,
      messages,
      max_tokens: opts.maxTokens ?? 400,
      temperature: opts.temperature ?? 0.2,
    }),
  });
  if (!res.ok) throw new Error(await describeUpstreamError(res));
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

/** Streaming completion. Returns the raw SSE body from OpenRouter. */
export async function streamCompletion(
  messages: OpenRouterMessage[],
  opts: CompletionOpts = {}
): Promise<ReadableStream<Uint8Array>> {
  const { model, headers } = openRouterConfig();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
    signal: opts.signal,
    body: JSON.stringify({
      model,
      stream: true,
      messages,
      max_tokens: opts.maxTokens ?? 1400,
      temperature: opts.temperature ?? 0.8,
    }),
  });
  if (!res.ok || !res.body) throw new Error(await describeUpstreamError(res));
  return res.body;
}

const THINK_BLOCK = /<think>[\s\S]*?<\/think>/g;
const CODE_FENCE = /```(?:json)?/gi;

/** Pull the first JSON object out of free-form model output. */
export function extractJsonObject<T = unknown>(text: string): T | null {
  const cleaned = text.replace(THINK_BLOCK, "").replace(CODE_FENCE, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/** Pull the first JSON array out of free-form model output. */
export function extractJsonArray<T = unknown>(text: string): T[] | null {
  const cleaned = text.replace(THINK_BLOCK, "").replace(CODE_FENCE, "");
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(v) ? (v as T[]) : null;
  } catch {
    return null;
  }
}
