// Client-side scenario model: a tree of messages (so any turn can be branched),
// persisted to localStorage.

import {
  dateOrdinal,
  type ApiMessage,
  type Figure,
  type FigureStatus,
  type LedgerEntry,
  type Posture,
  type Power,
  type Role,
  type Source,
  type TimelineEvent,
  type WorldUpdate,
} from "./types";

/** User renames keyed by the normalised displayed name; chains are followed. */
export type Renames = Record<string, string>;

/** Values the user has set by hand, keyed by normalised (renamed) name. */
export type Overrides = {
  powers?: Record<string, Posture>;
  figures?: Record<string, FigureStatus>;
  /** Figure key -> faction name ("" = unaffiliated). */
  factions?: Record<string, string>;
};

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
  /** Figure/power names the user has edited. */
  renames?: Renames;
  /** Posture/status pills the user has set by hand. */
  overrides?: Overrides;
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

/** Lowercased, letters and digits in any script (Hangul, Cyrillic, CJK…), runs of anything else collapsed to one space. */
export const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Resolve a name through the rename map, following chains (A→B, B→C). */
export function resolveName(name: string, renames: Renames | undefined): string {
  if (!renames) return name;
  let cur = name;
  for (let i = 0; i < 6; i++) {
    const next = renames[norm(cur)];
    if (!next || next === cur) break;
    cur = next;
  }
  return cur;
}

/** Apply user renames to every name-bearing field of an update. */
export function applyRenames(u: WorldUpdate, renames: Renames | undefined): WorldUpdate {
  if (!renames || Object.keys(renames).length === 0) return u;
  const r = (s: string) => resolveName(s, renames);
  return {
    ...u,
    figures: u.figures.map((f) => ({ ...f, name: r(f.name), faction: f.faction ? r(f.faction) : f.faction })),
    powers: u.powers.map((p) => ({
      ...p,
      name: r(p.name),
      relations: p.relations.map((rel) => ({ ...rel, with: r(rel.with) })),
    })),
  };
}

/** Apply the user's hand-set values to an update (after renames). */
export function applyOverrides(u: WorldUpdate, overrides: Overrides | undefined): WorldUpdate {
  const powers = overrides?.powers ?? {};
  const figures = overrides?.figures ?? {};
  const factions = overrides?.factions ?? {};
  if (!Object.keys(powers).length && !Object.keys(figures).length && !Object.keys(factions).length) return u;
  return {
    ...u,
    figures: u.figures.map((f) => {
      const key = norm(f.name);
      const status = figures[key];
      const faction = factions[key];
      return {
        ...f,
        status: status ?? f.status,
        faction: faction !== undefined ? faction : f.faction,
      };
    }),
    powers: u.powers.map((p) => (powers[norm(p.name)] ? { ...p, posture: powers[norm(p.name)] } : p)),
  };
}

/** The user's hand-set values as lists for the server, with display names. */
export function overridePairs(
  overrides: Overrides | undefined,
  world: WorldState
): {
  powers: { name: string; posture: Posture }[];
  figures: { name: string; status: FigureStatus }[];
  factions: { name: string; faction: string }[];
} {
  const powers = Object.entries(overrides?.powers ?? {}).flatMap(([key, posture]) => {
    const p = world.powers.find((x) => norm(x.name) === key);
    return p ? [{ name: p.name, posture }] : [];
  });
  const figures = Object.entries(overrides?.figures ?? {}).flatMap(([key, status]) => {
    const f = world.figures.find((x) => norm(x.name) === key);
    return f ? [{ name: f.name, status }] : [];
  });
  const factions = Object.entries(overrides?.factions ?? {}).flatMap(([key, faction]) => {
    const f = world.figures.find((x) => norm(x.name) === key);
    return f ? [{ name: f.name, faction }] : [];
  });
  return { powers, figures, factions };
}

// ---------- identity matching ----------

const tokens = (s: string) => norm(s).split(" ").filter(Boolean);

/**
 * Whether two names refer to the same entity: equal after normalisation, or one
 * is a whole-token run inside the other ("franz joseph i" in "emperor franz
 * joseph i of austria"). The shorter must have at least two tokens so bare first
 * names such as "Charles" never merge different people.
 */
export function sameEntity(a: string, b: string): boolean {
  const ka = norm(a);
  const kb = norm(b);
  if (ka === kb) return true;
  const [short, long] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  if (tokens(short).length < 2) return false;
  return (" " + long + " ").includes(" " + short + " ");
}

/** The power name a figure's faction refers to, if one matches; else the faction as given. */
export function canonicalFaction(faction: string, powerNames: string[]): string {
  if (!faction) return faction;
  const exact = powerNames.find((p) => norm(p) === norm(faction));
  if (exact) return exact;
  // "Byzantine Empire (opposition)" -> "Byzantine Empire"; "Rome" -> "Roman Republic" is left alone.
  const contained = powerNames.find((p) => tokens(p).length >= 2 && (" " + norm(faction) + " ").includes(" " + norm(p) + " "));
  return contained ?? faction;
}

/** The rename map as (from → to) pairs for the server, one per chain start. */
export function renamePairs(renames: Renames | undefined): { from: string; to: string }[] {
  if (!renames) return [];
  const out: { from: string; to: string }[] = [];
  for (const [key, to] of Object.entries(renames)) {
    const final = resolveName(to, renames);
    if (norm(final) !== key) out.push({ from: key, to: final });
  }
  return out;
}

/** Fold every reply's update along a path into the current world state.
 *  Figures and powers are keyed by (renamed) name — later entries replace earlier
 *  ones, keeping first-seen order; ledger rows accumulate; flashpoints are the latest. */
export function worldOnPath(path: MessageNode[], renames?: Renames, overrides?: Overrides): WorldState {
  const figures = new Map<string, Figure>();
  const powers = new Map<string, Power>();
  const ledger: LedgerEntry[] = [];
  let flashpoints: string[] = [];
  for (const n of path) {
    if (n.role !== "assistant" || !n.update) continue;
    const u = applyRenames(n.update, renames);
    for (const p of u.powers) {
      // A power re-listed under a variant name updates the earlier entry.
      const existing = [...powers.keys()].find((k) => sameEntity(k, p.name));
      if (existing) powers.set(existing, { ...p, name: powers.get(existing)!.name });
      else powers.set(norm(p.name), p);
    }
    for (const f of u.figures) {
      // Same person under a variant name ("Emperor Franz Joseph I") replaces the
      // earlier entry but keeps its first-seen name, so renames stay attached.
      const existing = [...figures.keys()].find((k) => sameEntity(k, f.name));
      if (existing) figures.set(existing, { ...f, name: figures.get(existing)!.name });
      else figures.set(norm(f.name), f);
    }
    ledger.push(...u.ledger);
    if (u.flashpoints.length) flashpoints = u.flashpoints;
  }
  // Hand-set values apply after merging, keyed by the displayed (first-seen) name,
  // so a later variant name cannot shake them off.
  const setPostures = overrides?.powers ?? {};
  const setStatuses = overrides?.figures ?? {};
  const setFactions = overrides?.factions ?? {};
  const finalPowers = [...powers.entries()].map(([key, p]) =>
    setPostures[key] ? { ...p, posture: setPostures[key] } : p
  );
  const powerNames = finalPowers.map((p) => p.name);
  return {
    figures: [...figures.entries()].map(([key, f]) => ({
      ...f,
      status: setStatuses[key] ?? f.status,
      // A hand-set faction wins as given; the narrator's snaps to a matching power name.
      faction: setFactions[key] !== undefined ? setFactions[key] : canonicalFaction(f.faction, powerNames),
    })),
    powers: finalPowers,
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
    .sort((a, b) => dateOrdinal(a.e) - dateOrdinal(b.e) || a.i - b.i)
    .map((x) => x.e);
}

export function toApiMessages(path: MessageNode[], renames?: Renames, overrides?: Overrides): ApiMessage[] {
  return path
    .filter((n) => n.content.trim().length > 0 || n.role === "user")
    .map((n) => {
      const raw =
        n.role === "assistant"
          ? n.update ?? (n.events.length ? { events: n.events, figures: [], powers: [], ledger: [], flashpoints: [] } : undefined)
          : undefined;
      return {
        role: n.role,
        content: n.content,
        update: raw ? applyOverrides(applyRenames(raw, renames), overrides) : undefined,
      };
    });
}

/** Human label for a branch: its last user message, shortened. */
export function branchLabel(s: Scenario, leafId: string, fallback = "Branch"): string {
  const path = pathTo(s, leafId);
  const lastUser = [...path].reverse().find((n) => n.role === "user");
  const text = lastUser?.content.replace(/\s+/g, " ").trim() ?? fallback;
  return text.length > 56 ? text.slice(0, 53) + "..." : text;
}

export function formatYear(y: number): string {
  return y < 0 ? `${-y} BCE` : String(y);
}

export function scenarioDisplayTitle(s: Scenario, untitled = "New scenario"): string {
  if (s.title) return s.title;
  const root = rootNode(s);
  if (root) {
    const t = root.content.replace(/\s+/g, " ").trim();
    return t.length > 48 ? t.slice(0, 45) + "..." : t;
  }
  return untitled;
}
