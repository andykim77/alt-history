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
};

export type ChatRequest = {
  messages: ApiMessage[];
  scenario: ScenarioMeta;
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
