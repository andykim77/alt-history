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

/** A message as sent to the API. Assistant messages carry their events so the
 *  model can see what is already on the timeline. */
export type ApiMessage = {
  role: Role;
  content: string;
  events?: TimelineEvent[];
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
  | { type: "meta"; title: string; divergence: string; divergenceYear: number | null }
  | { type: "sources"; sources: Source[] }
  | { type: "delta"; text: string }
  | { type: "events"; events: TimelineEvent[] }
  | { type: "error"; message: string }
  | { type: "done" };

export const TIMELINE_DELIMITER = "---TIMELINE---";
