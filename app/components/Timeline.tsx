"use client";

import { fmtSubDate, fmtYear } from "@/lib/i18n";
import { sortEvents } from "@/lib/scenario";
import type { EventType, Source, TimelineEvent } from "@/lib/types";
import { useLang } from "./LangContext";

export const TYPE_DOT: Record<EventType, string> = {
  history: "bg-zinc-400 dark:bg-zinc-500",
  divergence: "bg-amber-500",
  alt: "bg-sky-500",
};

export function EventRow({ ev, sources }: { ev: TimelineEvent; sources: Source[] }) {
  const { lang, t } = useLang();
  const src = ev.source ? sources[ev.source - 1] : undefined;
  const sub = fmtSubDate(ev, lang);
  return (
    <div className="relative flex gap-2 pl-5 text-[13.5px] leading-snug">
      <span
        className={`absolute left-0 top-[0.42rem] h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-zinc-950 ${TYPE_DOT[ev.type]}`}
        aria-hidden
      />
      {/* Every row leads with its date within the year; a faint dash when only the year is known. */}
      <span
        className={`shrink-0 font-mono text-[11px] tabular-nums leading-snug pt-px ${lang === "ko" ? "w-[4.2rem]" : "w-[3.4rem]"} ${
          sub ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-300 dark:text-zinc-700"
        }`}
        title={sub ? undefined : t.monthUnknown}
      >
        {sub || "—"}
      </span>
      <span className="min-w-0">
        {ev.label}
        {src && (
          <a href={src.url} target="_blank" rel="noreferrer" title={src.title} className="cite ml-1">
            [{ev.source}]
          </a>
        )}
      </span>
    </div>
  );
}

export function Legend() {
  const { t } = useLang();
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
      {(Object.keys(TYPE_DOT) as EventType[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${TYPE_DOT[k]}`} />
          {t.eventType[k]}
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
export function divergenceIndex(sorted: TimelineEvent[], divergenceYear: number | null): number {
  const typed = sorted.findIndex((e) => e.type === "divergence");
  if (typed >= 0) return typed;
  if (divergenceYear === null) return -1;
  return sorted.findIndex((e) => e.type !== "history" && e.year >= divergenceYear);
}

function DivergenceMarker() {
  const { t } = useLang();
  return (
    <div
      className="relative -ml-3 mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-amber-600 dark:text-amber-400"
      aria-label={t.pointOfDivergence}
    >
      <span className="h-px w-3 bg-amber-400/70" />
      <span className="rounded-full border border-amber-400/50 bg-amber-500/10 px-2 py-0.5">{t.pointOfDivergence}</span>
      <span className="h-px flex-1 bg-amber-400/40" />
    </div>
  );
}

export type YearGroup = { year: number; items: { ev: TimelineEvent; i: number }[] };

/** Consecutive events sharing a year, in the given (sorted) order. */
export function groupByYear(sorted: TimelineEvent[]): YearGroup[] {
  const groups: YearGroup[] = [];
  sorted.forEach((ev, i) => {
    const last = groups[groups.length - 1];
    if (last && last.year === ev.year) last.items.push({ ev, i });
    else groups.push({ year: ev.year, items: [{ ev, i }] });
  });
  return groups;
}

/**
 * Events grouped under one heading per year, so a year with several events
 * reads as a block instead of repeating the date on every row. `marker` is the
 * index (into `events`) before which the divergence pill is placed.
 */
export function EventList({
  events,
  sources,
  marker = -1,
}: {
  /** Already sorted. */
  events: TimelineEvent[];
  sources: Source[];
  marker?: number;
}) {
  const { lang, t } = useLang();
  const groups = groupByYear(events);
  return (
    <ol className="space-y-4">
      {groups.map((g) => (
        <li key={`${g.year}-${g.items[0].i}`} className="list-none">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="font-serif text-[15px] font-medium tabular-nums leading-none text-zinc-800 dark:text-zinc-100">
              {fmtYear(g.year, lang)}
            </span>
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            {g.items.length > 1 && (
              <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">{t.eventsCount(g.items.length)}</span>
            )}
          </div>
          <ul className="ml-1 space-y-2 border-l border-zinc-200 dark:border-zinc-800 pl-3 py-0.5">
            {g.items.map(({ ev, i }) => (
              <li key={i} className="list-none">
                {i === marker && <DivergenceMarker />}
                <EventRow ev={ev} sources={sources} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

export function Timeline({
  events,
  sources,
  divergenceYear,
}: {
  events: TimelineEvent[];
  sources: Source[];
  divergenceYear: number | null;
}) {
  const { t } = useLang();
  if (events.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">{t.timelineEmpty}</p>;
  }
  const sorted = sortEvents(events);
  return (
    <div className="space-y-3">
      <Legend />
      <EventList events={sorted} sources={sources} marker={divergenceIndex(sorted, divergenceYear)} />
    </div>
  );
}

export function SourceList({ sources }: { sources: Source[] }) {
  const { t } = useLang();
  if (sources.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">{t.sourcesEmpty}</p>;
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
