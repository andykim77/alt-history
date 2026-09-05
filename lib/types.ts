// Shared types between the API route and the client.

export type Role = "user" | "assistant";

export type Source = {
  /** 1-based citation number as shown in prose ([1], [2], ...). */
  n: number;
  title: string;
  url: string;
  /** Short display snippet (first ~240 chars of the intro). */
  snippet: string;
};

export type EventType = "history" | "divergence" | "alt";

export type TimelineEvent = {
  /** Calendar year; negative for BCE. */
  year: number;
  /** 1-12 when known. */
  month?: number | null;
  /** 1-31 when known (only meaningful with month). */
  day?: number | null;
  label: string;
  type: EventType;
  /** Citation number into the scenario's source list, if the event is sourced. */
  source?: number | null;
};

export type FigureStatus = "rising" | "stable" | "declining" | "dead" | "unknown";

export type Figure = {
  name: string;
  role: string;
  faction: string;
  status: FigureStatus;
  /** What happened to them in real history (sourced where possible). */
  realFate: string;
  /** What is happening to them in this timeline. */
  altFate: string;
  source?: number | null;
};

export type Posture = "expanding" | "consolidating" | "defensive" | "fracturing" | "collapsing" | "emerging";
export type Relation = "ally" | "rival" | "war" | "vassal" | "trade" | "neutral";

export type Power = {
  name: string;
  /** e.g. empire, kingdom, republic, church, league, dynasty, company */
  kind: string;
  /** 1 (marginal) to 5 (hegemon) */
  strength: number;
  posture: Posture;
  /** Strategic interests: what this power wants and why. */
  interests: string[];
  relations: { with: string; kind: Relation }[];
};

export type LedgerEntry = {
  year: number;
  /** What happened in real history. */
  ours: string;
  /** What happens in this timeline instead. */
  theirs: string;
  source?: number | null;
};

/** One reply's structured additions to the world. */
export type WorldUpdate = {
  events: TimelineEvent[];
  figures: Figure[];
  powers: Power[];
  ledger: LedgerEntry[];
  /** Open tensions the user could explore next. */
  flashpoints: string[];
};

export const emptyUpdate = (): WorldUpdate => ({
  events: [],
  figures: [],
  powers: [],
  ledger: [],
  flashpoints: [],
});

/** A message as sent to the API. Assistant messages carry their structured
 *  update so the model can see the world it already described. */
export type ApiMessage = {
  role: Role;
  content: string;
  update?: WorldUpdate;
};

export type ScenarioMeta = {
  title?: string;
  divergence?: string;
  divergenceYear?: number | null;
  /** Wikipedia titles already used as sources, in citation order. */
  sourceTitles: string[];
  /** Names the user has changed in the dossier; the model should adopt them. */
  renames?: { from: string; to: string }[];
};

/** Parse "YYYY", "YYYY-MM", "YYYY-MM-DD" (leading "-" for BCE) or a bare year. */
export function parseEventDate(v: unknown): { year: number; month: number | null; day: number | null } | null {
  if (typeof v === "number" && Number.isFinite(v)) return { year: Math.trunc(v), month: null, day: null };
  if (typeof v !== "string") return null;
  const s = v.trim();
  const m = /^(-?)(\d{1,4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(s);
  if (m) {
    const year = (m[1] ? -1 : 1) * parseInt(m[2], 10);
    const month = m[3] ? parseInt(m[3], 10) : null;
    const day = m[4] ? parseInt(m[4], 10) : null;
    const okMonth = month !== null && month >= 1 && month <= 12 ? month : null;
    const okDay = okMonth !== null && day !== null && day >= 1 && day <= 31 ? day : null;
    return { year, month: okMonth, day: okDay };
  }
  // Tolerate "216 BCE" / "1453 AD" style.
  const y = /(-?\d{1,4})\s*(BCE?|BC|AD|CE)?/i.exec(s);
  if (!y) return null;
  const n = parseInt(y[1], 10);
  const bce = y[2] && /^bc/i.test(y[2]);
  return { year: bce && n > 0 ? -n : n, month: null, day: null };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "29 May 1453", "May 1453", "1453", "2 Aug 216 BCE". */
export function formatEventDate(e: { year: number; month?: number | null; day?: number | null }): string {
  const y = e.year < 0 ? `${-e.year} BCE` : String(e.year);
  if (e.month && e.month >= 1 && e.month <= 12) {
    const mon = MONTHS[e.month - 1];
    return e.day ? `${e.day} ${mon} ${y}` : `${mon} ${y}`;
  }
  return y;
}

/** Sort key: unknown month/day sort before known ones within the same year. */
export function dateOrdinal(e: { year: number; month?: number | null; day?: number | null }): number {
  return e.year * 10000 + (e.month ?? 0) * 100 + (e.day ?? 0);
}

export type ChatRequest = {
  messages: ApiMessage[];
  scenario: ScenarioMeta;
  /** Language the narrator should write in ("en" default, "ko"). */
  lang?: "en" | "ko";
};

/** Server -> client SSE payloads (each is one `data:` line as JSON). */
export type StreamEvent =
  | { type: "status"; text: string }
  | { type: "meta"; title: string; divergence: string; divergenceYear: number | null; engine?: string }
  | { type: "sources"; sources: Source[] }
  | { type: "delta"; text: string }
  | { type: "update"; update: WorldUpdate }
  | { type: "error"; message: string }
  | { type: "done" };

export const STATE_DELIMITER = "---WORLDSTATE---";
