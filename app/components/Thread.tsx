"use client";

import { useEffect, useRef, useState } from "react";
import { childrenOf, type MessageNode, type Scenario } from "@/lib/scenario";
import { Markdown } from "./Markdown";

const STARTERS = [
  "What if the printing press was never invented?",
  "What if the Library of Alexandria never burned?",
  "What if the Black Death never reached Europe?",
  "What if Byzantium never fell in 1453?",
  "What if the Mongols had conquered Western Europe?",
  "What if Rome had lost the Second Punic War?",
];

type Props = {
  scenario: Scenario | null;
  path: MessageNode[];
  streamingNodeId: string | null;
  status: string | null;
  /** Node the next message will attach to (null = start of scenario). */
  composeParentId: string | null;
  /** Open tensions from the latest reply on this branch. */
  flashpoints: string[];
  onSend: (text: string, parentId: string | null) => void;
  onStop: () => void;
  onSwitchSibling: (nodeId: string) => void;
  onBranchHere: (nodeId: string) => void;
  onResumeLatest: () => void;
};

function SiblingSwitcher({
  scenario,
  node,
  onSwitch,
}: {
  scenario: Scenario;
  node: MessageNode;
  onSwitch: (id: string) => void;
}) {
  const siblings = childrenOf(scenario, node.parentId);
  if (siblings.length < 2) return null;
  const idx = siblings.findIndex((s) => s.id === node.id);
  return (
    <div className="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400 select-none">
      <button
        disabled={idx <= 0}
        onClick={() => onSwitch(siblings[idx - 1].id)}
        className="px-1 rounded hover:bg-black/[.06] dark:hover:bg-white/[.08] disabled:opacity-30"
        aria-label="Previous branch"
      >
        ‹
      </button>
      <span className="font-mono">
        branch {idx + 1}/{siblings.length}
      </span>
      <button
        disabled={idx >= siblings.length - 1}
        onClick={() => onSwitch(siblings[idx + 1].id)}
        className="px-1 rounded hover:bg-black/[.06] dark:hover:bg-white/[.08] disabled:opacity-30"
        aria-label="Next branch"
      >
        ›
      </button>
    </div>
  );
}

export function Thread({
  scenario,
  path,
  streamingNodeId,
  status,
  composeParentId,
  flashpoints,
  onSend,
  onStop,
  onSwitchSibling,
  onBranchHere,
  onResumeLatest,
}: Props) {
  const [input, setInput] = useState("");
  const [editParent, setEditParent] = useState<string | null | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = streamingNodeId !== null;

  // Keep the newest content in view while streaming.
  const lastContent = path[path.length - 1]?.content.length ?? 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: isStreaming ? "auto" : "smooth" });
  }, [lastContent, path.length, isStreaming]);

  // Grow the textarea with its content.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  const effectiveParent = editParent !== undefined ? editParent : composeParentId;
  const parentNode = scenario && effectiveParent ? scenario.nodes[effectiveParent] : null;
  const forkingMidThread =
    scenario !== null && parentNode !== null && parentNode !== undefined && childrenOf(scenario, parentNode.id).length > 0;
  const isEditing = editParent !== undefined;

  function submit() {
    const text = input.trim();
    if (!text || isStreaming) return;
    onSend(text, effectiveParent);
    setInput("");
    setEditParent(undefined);
  }

  function startEdit(node: MessageNode) {
    setInput(node.content);
    setEditParent(node.parentId);
    textareaRef.current?.focus();
  }

  const empty = path.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-6">
        <div className="mx-auto max-w-2xl space-y-5">
          {empty && (
            <div className="space-y-5 pt-6">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                  New scenario
                </div>
                <h2 className="font-serif text-2xl leading-tight mt-1">
                  Pick a moment in history. Change it. Watch the world reorganise.
                </h2>
              </div>
              <div className="grid sm:grid-cols-2 gap-2 text-[13px]">
                {[
                  ["Sourced", "Real history up to the divergence is checked against Wikipedia and cited."],
                  ["Timeline", "Every reply adds dated events, real and alternate, to a running timeline."],
                  ["Figures & powers", "Key people and states are tracked: interests, strength, posture, fates."],
                  ["Branches", "Fork at any reply, then compare how two branches diverge."],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-black/10 dark:border-white/10 px-3 py-2.5">
                    <div className="font-medium">{k}</div>
                    <div className="text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">{v}</div>
                  </div>
                ))}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Or start from one of these
              </div>
              <div className="flex flex-wrap gap-2 -mt-3">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => onSend(s, null)}
                    className="text-sm rounded-full border border-black/10 dark:border-white/15 px-3 py-1.5 hover:bg-black/[.04] dark:hover:bg-white/[.06] transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {scenario &&
            path.map((m) => {
              const isLive = m.id === streamingNodeId;
              if (m.role === "user") {
                return (
                  <div key={m.id} className="flex flex-col items-end gap-1">
                    <div className="rounded-2xl px-4 py-2.5 whitespace-pre-wrap leading-relaxed bg-black text-white dark:bg-white dark:text-black max-w-[85%]">
                      {m.content}
                    </div>
                    <div className="flex items-center gap-3 pr-1">
                      <SiblingSwitcher scenario={scenario} node={m} onSwitch={onSwitchSibling} />
                      {!isStreaming && (
                        <button
                          onClick={() => startEdit(m)}
                          className="text-[11px] text-zinc-500 hover:text-black dark:hover:text-white"
                          title="Edit this message and continue in a new branch"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                );
              }
              return (
                <div key={m.id} className="flex flex-col items-start gap-1">
                  <div className="rounded-2xl px-4 py-3 bg-black/[.04] dark:bg-white/[.06] max-w-[95%] w-full">
                    {m.content ? (
                      <Markdown content={m.content} sources={m.sources ?? scenario.sources} />
                    ) : isLive ? (
                      <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                        <span className="inline-block h-2 w-2 rounded-full bg-current animate-pulse" />
                        {status ?? "Thinking..."}
                      </div>
                    ) : (
                      <span className="text-sm text-zinc-500">(no reply)</span>
                    )}
                    {isLive && m.content && (
                      <span className="inline-block w-1.5 h-4 align-text-bottom bg-current opacity-60 animate-pulse ml-0.5" />
                    )}
                    {m.status === "error" && (
                      <div className="mt-2 text-xs text-red-600 dark:text-red-400 rounded-md bg-red-500/10 px-2.5 py-1.5">
                        {m.error ?? "The reply failed."}
                      </div>
                    )}
                    {m.status === "stopped" && (
                      <div className="mt-2 text-[11px] text-zinc-500">Stopped.</div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 pl-1">
                    <SiblingSwitcher scenario={scenario} node={m} onSwitch={onSwitchSibling} />
                    {!isStreaming && m.content && (
                      <button
                        onClick={() => onBranchHere(m.id)}
                        className="text-[11px] text-zinc-500 hover:text-black dark:hover:text-white"
                        title="Continue from this point in a new direction"
                      >
                        Branch here
                      </button>
                    )}
                    {m.events.length > 0 && (
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                        +{m.events.length} timeline event{m.events.length === 1 ? "" : "s"}
                        {m.update && m.update.figures.length > 0 && `, ${m.update.figures.length} figures`}
                        {m.update && m.update.powers.length > 0 && `, ${m.update.powers.length} powers`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

          {!isStreaming && !isEditing && !forkingMidThread && flashpoints.length > 0 && path.length > 0 && (
            <div className="pt-1">
              <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
                Flashpoints
              </div>
              <div className="flex flex-col gap-1.5">
                {flashpoints.map((f) => (
                  <button
                    key={f}
                    onClick={() => onSend(f, effectiveParent)}
                    className="text-left text-[13px] rounded-xl border border-amber-500/30 bg-amber-500/[.06] hover:bg-amber-500/[.12] px-3 py-2 transition-colors"
                  >
                    <span className="text-amber-600 dark:text-amber-400">›</span> {f}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-black/10 dark:border-white/10 px-4 sm:px-6 py-3">
        <div className="mx-auto max-w-2xl space-y-2">
          {(forkingMidThread || isEditing) && !isStreaming && (
            <div className="flex items-center justify-between gap-2 text-xs rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 px-3 py-1.5">
              <span>
                {isEditing
                  ? "Editing: sending creates a new branch from this point."
                  : "Your next message starts a new branch from the reply above."}
              </span>
              <button
                onClick={() => {
                  setEditParent(undefined);
                  setInput("");
                  onResumeLatest();
                }}
                className="font-medium hover:underline shrink-0"
              >
                {isEditing ? "Cancel" : "Back to latest"}
              </button>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex items-end gap-2"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder={empty ? "What if...?" : "Push the scenario further..."}
              disabled={isStreaming}
              className="flex-1 resize-none rounded-2xl border border-black/10 dark:border-white/15 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-black/30 dark:focus:border-white/40 disabled:opacity-50"
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                className="rounded-full border border-black/20 dark:border-white/25 px-4 py-2.5 text-sm font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06]"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="rounded-full bg-black text-white dark:bg-white dark:text-black px-4 py-2.5 text-sm font-medium disabled:opacity-40"
              >
                Send
              </button>
            )}
          </form>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
            Enter to send, Shift+Enter for a new line. Pre-divergence facts are checked against
            Wikipedia; everything after is speculation.
          </p>
        </div>
      </div>
    </div>
  );
}
