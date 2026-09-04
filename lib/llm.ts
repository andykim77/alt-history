// Provider abstraction: the app talks to `complete()` and `stream()`; the
// backing engine is chosen by LLM_PROVIDER.
//
//   LLM_PROVIDER=openrouter  (default)  — OpenRouter chat completions, streamed.
//   LLM_PROVIDER=koracle                — K-Oracle gateway (Claude / GPT / Gemini via
//                                          the andrewKim kit). Single prompt string,
//                                          no streaming: the reply arrives in one chunk.

import { complete as orComplete, openRouterConfig, streamCompletion } from "./openrouter";
import { koracleComplete, type KoracleProvider } from "./koracle";

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };
export type LlmOpts = { maxTokens?: number; temperature?: number; signal?: AbortSignal };

export type ProviderId = "openrouter" | "koracle";

export function providerId(): ProviderId {
  return process.env.LLM_PROVIDER === "koracle" ? "koracle" : "openrouter";
}

function koracleProvider(): KoracleProvider {
  const p = process.env.KORACLE_PROVIDER;
  return p === "openai" || p === "google" ? p : "anthropic";
}

const KORACLE_DEFAULT_LABEL: Record<KoracleProvider, string> = {
  anthropic: "Claude",
  openai: "GPT",
  google: "Gemini",
};

/** Short human label for the header, e.g. "Claude via K-Oracle". */
export function engineLabel(): string {
  if (providerId() === "koracle") {
    const model = process.env.KORACLE_MODEL;
    return `${model || KORACLE_DEFAULT_LABEL[koracleProvider()]} via K-Oracle`;
  }
  try {
    return `${openRouterConfig().model} via OpenRouter`;
  } catch {
    return "OpenRouter";
  }
}

export function supportsStreaming(): boolean {
  return providerId() === "openrouter";
}

// ---- K-Oracle: flatten a chat transcript into system + prompt ----

// Gateway limits: system <= 20000 chars. The prompt limit is not documented, so we
// keep the transcript bounded by dropping the oldest turns first.
const SYSTEM_MAX = 20000;
const PROMPT_MAX = 48000;

function flatten(messages: LlmMessage[]): { system?: string; prompt: string } {
  let system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  if (system.length > SYSTEM_MAX) {
    system = system.slice(0, SYSTEM_MAX - 40).trimEnd() + "\n[…system prompt truncated]";
  }
  const turns = messages.filter((m) => m.role !== "system");
  if (turns.length === 1 && turns[0].role === "user") {
    return { system: system || undefined, prompt: turns[0].content.slice(0, PROMPT_MAX) };
  }
  const render = (list: LlmMessage[]) =>
    list.map((m) => `${m.role === "user" ? "[User]" : "[Narrator]"}\n${m.content}`).join("\n\n");
  const frame = (transcript: string, dropped: number) =>
    `Conversation so far${dropped ? ` (earliest ${dropped} turns omitted for length)` : ""}:\n\n${transcript}\n\nContinue as the Narrator, responding to the last [User] message. Output only the Narrator's reply.`;
  let kept = turns;
  let dropped = 0;
  let prompt = frame(render(kept), dropped);
  while (prompt.length > PROMPT_MAX && kept.length > 2) {
    kept = kept.slice(2);
    dropped += 2;
    prompt = frame(render(kept), dropped);
  }
  return { system: system || undefined, prompt };
}

// ---- public API ----

/** Non-streaming completion; used for small structured calls (grounding). */
export async function complete(messages: LlmMessage[], opts: LlmOpts = {}): Promise<string> {
  if (providerId() === "koracle") {
    const { system, prompt } = flatten(messages);
    const r = await koracleComplete({
      prompt,
      system,
      provider: koracleProvider(),
      model: process.env.KORACLE_MODEL || undefined,
      max_tokens: opts.maxTokens,
      signal: opts.signal,
    });
    return r.text;
  }
  return orComplete(messages, opts);
}

/** Text deltas. For non-streaming providers this yields a single chunk. */
export async function* stream(messages: LlmMessage[], opts: LlmOpts = {}): AsyncGenerator<string> {
  if (providerId() === "koracle") {
    const text = await complete(messages, opts);
    if (text) yield text;
    return;
  }
  const body = await streamCompletion(messages, opts);
  yield* parseOpenRouterSse(body);
}

async function* parseOpenRouterSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
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
      let parsed: { error?: { message?: string }; choices?: { delta?: { content?: string } }[] };
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      if (parsed.error) throw new Error(parsed.error.message || JSON.stringify(parsed.error));
      const delta = parsed.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta) yield delta;
    }
  }
}
