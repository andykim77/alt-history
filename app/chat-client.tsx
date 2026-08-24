"use client";

import { useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "What if the printing press was never invented?",
  "What if the Library of Alexandria never burned?",
  "What if the Black Death never reached Europe?",
  "What if Byzantium never fell in 1453?",
];

export default function ChatClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    setError(null);
    const nextMessages: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setIsStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith("data:")) continue;
          const payload = trimmedLine.slice(5).trim();
          if (payload === "[DONE]") continue;

          try {
            const parsed = JSON.parse(payload);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantText += delta;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: assistantText };
                return copy;
              });
            }
          } catch {
            // Ignore malformed/partial SSE chunks.
          }
        }
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <div className="flex flex-col w-full max-w-2xl h-[80vh] mx-auto">
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">
              Propose a divergence from real history and see where it leads. Try one:
            </p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-sm rounded-full border border-black/10 dark:border-white/15 px-3 py-1.5 hover:bg-black/[.04] dark:hover:bg-white/[.06] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-2xl px-4 py-3 whitespace-pre-wrap leading-relaxed ${
              m.role === "user"
                ? "bg-black text-white dark:bg-white dark:text-black ml-auto max-w-[80%]"
                : "bg-black/[.04] dark:bg-white/[.06] mr-auto max-w-[85%]"
            }`}
          >
            {m.content || (isStreaming && i === messages.length - 1 ? "…" : "")}
          </div>
        ))}

        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 rounded-lg bg-red-500/10 px-3 py-2">
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 border-t border-black/10 dark:border-white/15 pt-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What if...?"
          disabled={isStreaming}
          className="flex-1 rounded-full border border-black/10 dark:border-white/15 bg-transparent px-4 py-2 text-sm outline-none focus:border-black/30 dark:focus:border-white/40 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isStreaming || !input.trim()}
          className="rounded-full bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          {isStreaming ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
