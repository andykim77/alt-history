"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deepestLeaf,
  emptyStore,
  eventsOnPath,
  leaves,
  loadStore,
  newScenario,
  norm,
  pathTo,
  renamePairs,
  saveStore,
  scenarioDisplayTitle,
  toApiMessages,
  uid,
  worldOnPath,
  type MessageNode,
  type Scenario,
  type Store,
} from "@/lib/scenario";
import type { ChatRequest, StreamEvent, WorldUpdate } from "@/lib/types";
import { Sidebar } from "./components/Sidebar";
import { Thread } from "./components/Thread";
import { SourceList, Timeline } from "./components/Timeline";
import { Compare } from "./components/Compare";
import { Figures } from "./components/Figures";
import { Powers } from "./components/Powers";
import { Ledger } from "./components/Ledger";

type PanelTab = "timeline" | "figures" | "powers" | "changes" | "sources" | "compare";
const TABS: { id: PanelTab; label: string }[] = [
  { id: "timeline", label: "Timeline" },
  { id: "figures", label: "Figures" },
  { id: "powers", label: "Powers" },
  { id: "changes", label: "Changes" },
  { id: "sources", label: "Sources" },
  { id: "compare", label: "Compare" },
];
type Drawer = "left" | "right" | null;

export default function ChatClient() {
  const [store, setStore] = useState<Store>(emptyStore);
  const [loaded, setLoaded] = useState(false);
  const [streaming, setStreaming] = useState<{ scenarioId: string; nodeId: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [tab, setTab] = useState<PanelTab>("timeline");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Set by Stop: finish the word-by-word reveal immediately. */
  const skipRevealRef = useRef(false);

  // ----- persistence -----
  useEffect(() => {
    setStore(loadStore());
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) saveStore(store);
  }, [store, loaded]);

  const active = useMemo(
    () => store.scenarios.find((s) => s.id === store.activeId) ?? null,
    [store]
  );
  const path = useMemo(() => (active ? pathTo(active, active.leafId) : []), [active]);
  const pathEvents = useMemo(() => eventsOnPath(path), [path]);
  const world = useMemo(() => worldOnPath(path, active?.renames), [path, active?.renames]);

  function renameEntity(from: string, to: string) {
    if (!active) return;
    updateScenario(active.id, (s) => ({
      ...s,
      renames: { ...(s.renames ?? {}), [norm(from)]: to },
      updatedAt: Date.now(),
    }));
  }

  const updateScenario = useCallback((id: string, fn: (s: Scenario) => Scenario) => {
    setStore((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((s) => (s.id === id ? fn(s) : s)),
    }));
  }, []);

  const updateNode = useCallback(
    (scenarioId: string, nodeId: string, fn: (n: MessageNode) => MessageNode) => {
      updateScenario(scenarioId, (s) => {
        const n = s.nodes[nodeId];
        if (!n) return s;
        return { ...s, nodes: { ...s.nodes, [nodeId]: fn(n) }, updatedAt: Date.now() };
      });
    },
    [updateScenario]
  );

  // ----- scenario management -----
  function createScenario(): Scenario {
    const s = newScenario();
    setStore((prev) => ({ ...prev, scenarios: [...prev.scenarios, s], activeId: s.id }));
    return s;
  }
  function selectScenario(id: string) {
    setStore((prev) => ({ ...prev, activeId: id }));
    setDrawer(null);
  }
  function deleteScenario(id: string) {
    if (streaming?.scenarioId === id) stop();
    setStore((prev) => {
      const scenarios = prev.scenarios.filter((s) => s.id !== id);
      const activeId =
        prev.activeId === id ? (scenarios.length ? scenarios[scenarios.length - 1].id : null) : prev.activeId;
      return { ...prev, scenarios, activeId };
    });
  }

  // ----- branching -----
  function setLeaf(scenarioId: string, leafId: string) {
    updateScenario(scenarioId, (s) => ({ ...s, leafId }));
  }
  function switchSibling(nodeId: string) {
    if (!active) return;
    setLeaf(active.id, deepestLeaf(active, nodeId));
  }
  function branchHere(nodeId: string) {
    if (!active) return;
    setLeaf(active.id, nodeId);
  }
  function resumeLatest() {
    if (!active || !active.leafId) return;
    setLeaf(active.id, deepestLeaf(active, active.leafId));
  }

  // ----- streaming -----
  function stop() {
    skipRevealRef.current = true;
    abortRef.current?.abort();
  }

  async function send(text: string, parentId: string | null) {
    if (streaming) return;
    let scenario = active;
    if (!scenario || (parentId === null && Object.keys(scenario.nodes).length > 0)) {
      // No active scenario, or a starter clicked from a blank state: start fresh.
      scenario = scenario && Object.keys(scenario.nodes).length === 0 ? scenario : createScenario();
    }
    const scenarioId = scenario.id;
    const now = Date.now();
    const userNode: MessageNode = {
      id: uid(),
      parentId,
      role: "user",
      content: text,
      events: [],
      createdAt: now,
    };
    const assistantNode: MessageNode = {
      id: uid(),
      parentId: userNode.id,
      role: "assistant",
      content: "",
      events: [],
      status: "streaming",
      createdAt: now + 1,
    };

    // Build the request from the tree *before* the state update lands.
    const parentPath = pathTo(scenario, parentId);
    const request: ChatRequest = {
      messages: toApiMessages([...parentPath, userNode], scenario.renames),
      scenario: {
        title: scenario.grounded ? scenario.title : undefined,
        divergence: scenario.grounded ? scenario.divergence : undefined,
        divergenceYear: scenario.grounded ? scenario.divergenceYear : null,
        sourceTitles: scenario.sourceTitles,
        renames: renamePairs(scenario.renames),
      },
    };

    updateScenario(scenarioId, (s) => ({
      ...s,
      nodes: { ...s.nodes, [userNode.id]: userNode, [assistantNode.id]: assistantNode },
      leafId: assistantNode.id,
      updatedAt: now,
    }));
    setStreaming({ scenarioId, nodeId: assistantNode.id });
    setStatus("Preparing...");

    const controller = new AbortController();
    abortRef.current = controller;
    skipRevealRef.current = false;
    let content = "";
    let finished = false;
    let revealTimer: ReturnType<typeof setInterval> | null = null;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // The text is revealed word by word at a steady pace, so a reply that
      // arrives in one piece (the gateway) or in ragged chunks (streaming) prints
      // smoothly. `target` is what has arrived; `content` is what is shown.
      let target = "";
      let streamEnded = false;
      // Held in an object because it is assigned inside a closure.
      const pending: { update: WorldUpdate | null } = { update: null };
      let revealDone: () => void = () => {};
      const revealed = new Promise<void>((resolve) => (revealDone = resolve));
      const tick = () => {
        if (skipRevealRef.current) content = target;
        if (content.length < target.length) {
          const remaining = target.length - content.length;
          let next = content.length + Math.max(2, Math.min(14, Math.ceil(remaining / 60)));
          // Extend to the next whitespace so markdown markers do not flicker mid-word.
          const ws = /\s/.exec(target.slice(next, next + 24));
          if (ws) next += ws.index + 1;
          content = target.slice(0, Math.min(target.length, next));
          const snapshot = content;
          updateNode(scenarioId, assistantNode.id, (n) => ({ ...n, content: snapshot }));
        }
        if (streamEnded && content.length >= target.length) {
          if (revealTimer) clearInterval(revealTimer);
          revealTimer = null;
          revealDone();
        }
      };
      revealTimer = setInterval(tick, 16);

      const handle = (ev: StreamEvent) => {
        switch (ev.type) {
          case "status":
            setStatus(ev.text);
            break;
          case "meta":
            updateScenario(scenarioId, (s) => {
              const withEngine = ev.engine ? { ...s, engine: ev.engine } : s;
              return withEngine.grounded
                ? withEngine
                : {
                    ...withEngine,
                    grounded: true,
                    title: ev.title || s.title,
                    divergence: ev.divergence,
                    divergenceYear: ev.divergenceYear,
                  };
            });
            break;
          case "sources":
            updateScenario(scenarioId, (s) => ({
              ...s,
              sources: ev.sources,
              sourceTitles: ev.sources.map((x) => x.title),
              nodes: {
                ...s.nodes,
                [assistantNode.id]: { ...s.nodes[assistantNode.id], sources: ev.sources },
              },
            }));
            break;
          case "delta":
            target += ev.text;
            break;
          case "update":
            // Applied once the text has finished printing, so the dossier does not
            // jump ahead of the narration.
            pending.update = ev.update;
            break;
          case "error":
            skipRevealRef.current = true;
            updateNode(scenarioId, assistantNode.id, (n) => ({ ...n, status: "error", error: ev.message }));
            finished = true;
            break;
          case "done":
            finished = true;
            break;
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          try {
            handle(JSON.parse(t.slice(5)) as StreamEvent);
          } catch {
            // ignore malformed line
          }
        }
      }
      streamEnded = true;
      await revealed;
      if (pending.update) {
        const update = pending.update;
        updateNode(scenarioId, assistantNode.id, (n) => ({ ...n, update, events: update.events }));
      }
      if (!finished) {
        updateNode(scenarioId, assistantNode.id, (n) => ({
          ...n,
          status: "error",
          error: "The stream ended unexpectedly.",
        }));
      }
    } catch (err) {
      const aborted = controller.signal.aborted;
      updateNode(scenarioId, assistantNode.id, (n) => ({
        ...n,
        content: n.content.length >= content.length ? n.content : content,
        status: aborted ? "stopped" : "error",
        error: aborted ? undefined : err instanceof Error ? err.message : "Something went wrong.",
      }));
    } finally {
      if (revealTimer) clearInterval(revealTimer);
      skipRevealRef.current = false;
      // Clear the streaming flag; keep 'stopped'/'error' markers, drop 'streaming'.
      updateNode(scenarioId, assistantNode.id, (n) =>
        n.status === "streaming" ? { ...n, status: undefined } : n
      );
      setStreaming(null);
      setStatus(null);
      abortRef.current = null;
    }
  }

  // ----- render -----
  const streamingNodeId = streaming && streaming.scenarioId === active?.id ? streaming.nodeId : null;
  const branchTotal = active ? leaves(active).length : 0;

  const counts: Record<PanelTab, number> = {
    timeline: pathEvents.length,
    figures: world.figures.length,
    powers: world.powers.length,
    changes: world.ledger.length,
    sources: active?.sources.length ?? 0,
    compare: branchTotal > 1 ? branchTotal : 0,
  };

  const panel = active ? (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-3 pb-2 border-b border-black/10 dark:border-white/10">
        <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
          Dossier
        </div>
        {active.divergence ? (
          <p className="font-serif text-[13.5px] leading-snug mt-0.5 text-zinc-700 dark:text-zinc-300 line-clamp-2">
            {active.divergence}
          </p>
        ) : (
          <p className="text-xs text-zinc-500 mt-0.5">The world state builds as you explore.</p>
        )}
        <div className="mt-2.5 grid grid-cols-3 gap-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[12px] leading-none transition-colors ${
                tab === t.id
                  ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white"
                  : "border-black/10 dark:border-white/15 text-zinc-600 dark:text-zinc-300 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
              }`}
            >
              <span>{t.label}</span>
              <span
                className={`font-mono text-[10.5px] tabular-nums ${
                  tab === t.id ? "opacity-70" : "text-zinc-400 dark:text-zinc-500"
                } ${counts[t.id] > 0 ? "" : "invisible"}`}
              >
                {counts[t.id] || 0}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {tab === "timeline" && (
          <Timeline events={pathEvents} sources={active.sources} divergenceYear={active.divergenceYear} />
        )}
        {tab === "figures" && <Figures figures={world.figures} sources={active.sources} onRename={renameEntity} />}
        {tab === "powers" && <Powers powers={world.powers} onRename={renameEntity} />}
        {tab === "changes" && <Ledger ledger={world.ledger} sources={active.sources} />}
        {tab === "sources" && <SourceList sources={active.sources} />}
        {tab === "compare" && (
          <Compare
            scenario={active}
            onShowBranch={(leafId) => {
              setLeaf(active.id, leafId);
              setDrawer(null);
            }}
          />
        )}
      </div>
    </div>
  ) : (
    <div className="p-4 text-sm text-zinc-500 dark:text-zinc-400">
      Start a scenario and its dossier builds here: timeline, key figures, powers and
      their interests, what changed, and the sources behind it.
    </div>
  );

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 dark:bg-zinc-950 text-black dark:text-zinc-50">
      <header className="flex items-center gap-3 border-b border-black/10 dark:border-white/10 px-3 sm:px-4 h-12 shrink-0">
        <button
          onClick={() => setDrawer(drawer === "left" ? null : "left")}
          className="lg:hidden rounded-md px-2 py-1 text-sm hover:bg-black/[.06] dark:hover:bg-white/[.08]"
          aria-label="Scenarios"
        >
          ☰
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-serif font-medium text-[17px] tracking-tight shrink-0">Alt History Explorer</span>
            {active && Object.keys(active.nodes).length > 0 && (
              <span className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                / {scenarioDisplayTitle(active)}
                {active.divergenceYear !== null && (
                  <span className="ml-2 font-mono text-xs rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5">
                    {active.divergenceYear < 0 ? `${-active.divergenceYear} BCE` : active.divergenceYear}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
        {active?.engine && (
          <span
            className="hidden sm:inline font-mono text-[10px] text-zinc-400 dark:text-zinc-500 truncate max-w-[16rem]"
            title="Model narrating this scenario"
          >
            {active.engine}
          </span>
        )}
        <button
          onClick={() => setDrawer(drawer === "right" ? null : "right")}
          className="lg:hidden rounded-md px-2 py-1 text-sm hover:bg-black/[.06] dark:hover:bg-white/[.08]"
        >
          Dossier
        </button>
      </header>

      <div className="flex flex-1 min-h-0 relative">
        <aside className="hidden lg:block w-64 shrink-0 border-r border-black/10 dark:border-white/10">
          <Sidebar
            scenarios={store.scenarios}
            activeId={store.activeId}
            onSelect={selectScenario}
            onNew={() => {
              createScenario();
              setDrawer(null);
            }}
            onDelete={deleteScenario}
          />
        </aside>

        <main className="flex-1 min-w-0 min-h-0">
          <Thread
            key={active?.id ?? "none"}
            scenario={active}
            path={path}
            streamingNodeId={streamingNodeId}
            status={status}
            composeParentId={active?.leafId ?? null}
            flashpoints={world.flashpoints}
            onSend={send}
            onStop={stop}
            onSwitchSibling={switchSibling}
            onBranchHere={branchHere}
            onResumeLatest={resumeLatest}
          />
        </main>

        <aside className="hidden lg:block w-[22rem] xl:w-[26rem] shrink-0 border-l border-black/10 dark:border-white/10 bg-zinc-100/60 dark:bg-zinc-900/40">
          {panel}
        </aside>

        {drawer && (
          <div className="lg:hidden absolute inset-0 z-20 flex">
            {drawer === "right" && <div className="flex-1 bg-black/30" onClick={() => setDrawer(null)} />}
            <div className="w-[85%] max-w-sm bg-zinc-50 dark:bg-zinc-950 shadow-xl overflow-hidden">
              {drawer === "left" ? (
                <Sidebar
                  scenarios={store.scenarios}
                  activeId={store.activeId}
                  onSelect={selectScenario}
                  onNew={() => {
                    createScenario();
                    setDrawer(null);
                  }}
                  onDelete={deleteScenario}
                />
              ) : (
                panel
              )}
            </div>
            {drawer === "left" && <div className="flex-1 bg-black/30" onClick={() => setDrawer(null)} />}
          </div>
        )}
      </div>
    </div>
  );
}
