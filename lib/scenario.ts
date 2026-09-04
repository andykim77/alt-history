// Client-side scenario model: a tree of messages (so any turn can be branched),
// persisted to localStorage.

import type { ApiMessage, Role, Source, TimelineEvent } from "./types";

export type NodeStatus = "streaming" | "stopped" | "error";

export type MessageNode = {
  id: string;
  parentId: string | null;
  role: Role;
  content: string;
  events: TimelineEvent[];
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
export function eventsOnPath(path: MessageNode[]): TimelineEvent[] {
  return path.flatMap((n) => (n.role === "assistant" ? n.events : []));
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
      events: n.role === "assistant" && n.events.length ? n.events : undefined,
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
