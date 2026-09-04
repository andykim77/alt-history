"use client";

import { sortEvents } from "@/lib/scenario";
import { formatEventDate, type EventType, type Source, type TimelineEvent } from "@/lib/types";

export const TYPE_STYLE: Record<EventType, { dot: string; label: string }> = {
  history: { dot: "bg-zinc-400 dark:bg-zinc-500", label: "Real history" },
  divergence: { dot: "bg-amber-500", label: "Divergence" },
  alt: { dot: "bg-sky-500", label: "Alternate" },
};

export function EventRow({
  ev,
  sources,
  compact = false,
}: {
  ev: TimelineEvent;
  sources: Source[];
  /** Stack year above label; for narrow columns such as the compare view. */
  compact?: boolean;
}) {
  const src = ev.source ? sources[ev.source - 1] : undefined;
  const cite = src && (
    <a href={src.url} target="_blank" rel="noreferrer" title={src.title} className="cite ml-1">
      [{ev.source}]
    </a>
  );
  return (
    <div className="relative pl-5">
      <span
        className={`absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-zinc-950 ${TYPE_STYLE[ev.type].dot}`}
        aria-hidden
      />
      {compact ? (
        <div>
          <div className="font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400 leading-tight">
            {formatEventDate(ev)}
          </div>
          <div className="text-[13px] leading-snug">
            {ev.label}
            {cite}
          </div>
        </div>
      ) : (
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400 w-[5.5rem] shrink-0 leading-snug">
            {formatEventDate(ev)}
          </span>
          <span className="text-sm leading-snug">
            {ev.label}
            {cite}
          </span>
        </div>
      )}
    </div>
  );
}

export function Legend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
      {(Object.keys(TYPE_STYLE) as EventType[]).map((t) => (
        <span key={t} className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${TYPE_STYLE[t].dot}`} />
          {TYPE_STYLE[t].label}
        </span>
      ))}
    </div>
  );
}

/**
 * Index of the event before which the "point of divergence" marker belongs:
 * the first event typed as the divergence; failing that, the first non-history
 * event dated on or after the divergence year. -1 when nothing qualifies.
 */
function divergenceIndex(sorted: TimelineEvent[], divergenceYear: number | null): number {
  const typed = sorted.findIndex((e) => e.type === "divergence");
  if (typed >= 0) return typed;
  if (divergenceYear === null) return -1;
  return sorted.findIndex((e) => e.type !== "history" && e.year >= divergenceYear);
}

export function Timeline({
  events,
  sources,
  divergenceYear,
  compact = false,
}: {
  events: TimelineEvent[];
  sources: Source[];
  divergenceYear: number | null;
  compact?: boolean;
}) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Dated events from the narration will collect here as the scenario unfolds.
      </p>
    );
  }
  const sorted = sortEvents(events);
  const marker = divergenceIndex(sorted, divergenceYear);
  return (
    <div className="space-y-3">
      <Legend />
      <ol className="relative space-y-3 border-l border-zinc-200 dark:border-zinc-800 ml-1 pl-3 py-1">
        {sorted.map((ev, i) => (
          <li key={`${ev.year}-${ev.label}-${i}`} className="list-none">
            {i === marker && (
              <div
                className="relative -ml-3 mb-3 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-amber-600 dark:text-amber-400"
                aria-label="Point of divergence"
              >
                <span className="h-px w-3 bg-amber-400/70" />
                <span className="rounded-full border border-amber-400/50 bg-amber-500/10 px-2 py-0.5">
                  point of divergence
                </span>
                <span className="h-px flex-1 bg-amber-400/40" />
              </div>
            )}
            <EventRow ev={ev} sources={sources} compact={compact} />
          </li>
        ))}
      </ol>
    </div>
  );
}

export function SourceList({ sources }: { sources: Source[] }) {
  if (sources.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Wikipedia articles used to verify the history before the divergence will appear here.
      </p>
    );
  }
  return (
    <ol className="space-y-3">
      {sources.map((s) => (
        <li key={s.n} className="text-sm">
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="font-medium hover:underline inline-flex items-baseline gap-1.5"
          >
            <span className="cite">[{s.n}]</span>
            {s.title}
          </a>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-3">{s.snippet}</p>
        </li>
      ))}
    </ol>
  );
}
