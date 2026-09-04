// Client-side scenario model: a tree of messages (so any turn can be branched),
// persisted to localStorage.

import type { ApiMessage, Figure, LedgerEntry, Power, Role, Source, TimelineEvent, WorldUpdate } from "./types";

export type NodeStatus = "streaming" | "stopped" | "error";

export type MessageNode = {
  id: string;
  parentId: string | null;
  role: Role;
  content: string;
  /** Kept for scenarios saved before structured updates existed. */
  events: TimelineEvent[];
  /** Structured dossier changes introduced by this reply. */
  update?: WorldUpdate;
  /** Snapshot of the source list this reply cited against. */
  sources?: Source[];
  status?: NodeStatus;
  error?: string;
  createdAt: number;
};

export type Scenario = {
  id: string;
  title: string;
  divergence: string;
  divergenceYear: number | null;
  /** True once the server has identified the divergence (first reply received). */
  grounded: boolean;
  sourceTitles: string[];
  sources: Source[];
  /** Label of the model/provider that last narrated this scenario. */
  engine?: string;
  nodes: Record<string, MessageNode>;
  /** The node currently displayed at the bottom of the thread. */
  leafId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type Store = {
  version: 1;
  scenarios: Scenario[];
  activeId: string | null;
};

const STORAGE_KEY = "alt-history:store:v1";

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function emptyStore(): Store {
  return { version: 1, scenarios: [], activeId: null };
}

export function newScenario(): Scenario {
  const now = Date.now();
  return {
    id: uid(),
    title: "",
    divergence: "",
    divergenceYear: null,
    grounded: false,
    sourceTitles: [],
    sources: [],
    nodes: {},
    leafId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Store;
    if (parsed?.version !== 1 || !Array.isArray(parsed.scenarios)) return emptyStore();
    // Any node left mid-stream by a closed tab is marked stopped.
    for (const s of parsed.scenarios) {
      for (const n of Object.values(s.nodes)) if (n.status === "streaming") n.status = "stopped";
    }
    return parsed;
  } catch {
    return emptyStore();
  }
}

export function saveStore(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota or privacy mode: the session still works in memory.
  }
}

// ---------- tree helpers ----------

export function pathTo(s: Scenario, id: string | null): MessageNode[] {
  const out: MessageNode[] = [];
  let cur = id ? s.nodes[id] : undefined;
  while (cur) {
    out.push(cur);
    cur = cur.parentId ? s.nodes[cur.parentId] : undefined;
  }
  return out.reverse();
}

export function childrenOf(s: Scenario, parentId: string | null): MessageNode[] {
  return Object.values(s.nodes)
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Follow the most recent child at each step down to a leaf. */
export function deepestLeaf(s: Scenario, id: string): string {
  let cur = id;
  for (;;) {
    const kids = childrenOf(s, cur);
    if (kids.length === 0) return cur;
    cur = kids[kids.length - 1].id;
  }
}

export function leaves(s: Scenario): MessageNode[] {
  const hasChild = new Set(Object.values(s.nodes).map((n) => n.parentId).filter(Boolean));
  return Object.values(s.nodes)
    .filter((n) => !hasChild.has(n.id))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function branchCount(s: Scenario): number {
  return Math.max(1, leaves(s).length);
}

export function rootNode(s: Scenario): MessageNode | undefined {
  return childrenOf(s, null)[0];
}

/** Events along a path, in path order (so later replies come later within a year). */
export function nodeEvents(n: MessageNode): TimelineEvent[] {
  return n.update?.events ?? n.events ?? [];
}

export function eventsOnPath(path: MessageNode[]): TimelineEvent[] {
  return path.flatMap((n) => (n.role === "assistant" ? nodeEvents(n) : []));
}

export type WorldState = {
  figures: Figure[];
  powers: Power[];
  ledger: LedgerEntry[];
  flashpoints: string[];
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Fold every reply's update along a path into the current world state.
 *  Figures and powers are keyed by name (later entries replace earlier ones,
 *  keeping first-seen order); ledger rows accumulate; flashpoints are the latest. */
export function worldOnPath(path: MessageNode[]): WorldState {
  const figures = new Map<string, Figure>();
  const powers = new Map<string, Power>();
  const ledger: LedgerEntry[] = [];
  let flashpoints: string[] = [];
  for (const n of path) {
    if (n.role !== "assistant" || !n.update) continue;
    for (const f of n.update.figures) figures.set(norm(f.name), f);
    for (const p of n.update.powers) powers.set(norm(p.name), p);
    ledger.push(...n.update.ledger);
    if (n.update.flashpoints.length) flashpoints = n.update.flashpoints;
  }
  return {
    figures: [...figures.values()],
    powers: [...powers.values()],
    ledger: ledger
      .map((e, i) => ({ e, i }))
      .sort((a, b) => a.e.year - b.e.year || a.i - b.i)
      .map((x) => x.e),
    flashpoints,
  };
}

export function sortEvents<T extends TimelineEvent>(events: T[]): T[] {
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.year - b.e.year || a.i - b.i)
    .map((x) => x.e);
}

export function toApiMessages(path: MessageNode[]): ApiMessage[] {
  return path
    .filter((n) => n.content.trim().length > 0 || n.role === "user")
    .map((n) => ({
      role: n.role,
      content: n.content,
      update:
        n.role === "assistant"
          ? n.update ?? (n.events.length ? { events: n.events, figures: [], powers: [], ledger: [], flashpoints: [] } : undefined)
          : undefined,
    }));
}

/** Human label for a branch: its last user message, shortened. */
export function branchLabel(s: Scenario, leafId: string): string {
  const path = pathTo(s, leafId);
  const lastUser = [...path].reverse().find((n) => n.role === "user");
  const text = lastUser?.content.replace(/\s+/g, " ").trim() ?? "Branch";
  return text.length > 56 ? text.slice(0, 53) + "..." : text;
}

export function formatYear(y: number): string {
  return y < 0 ? `${-y} BCE` : String(y);
}

export function scenarioDisplayTitle(s: Scenario): string {
  if (s.title) return s.title;
  const root = rootNode(s);
  if (root) {
    const t = root.content.replace(/\s+/g, " ").trim();
    return t.length > 48 ? t.slice(0, 45) + "..." : t;
  }
  return "New scenario";
}
