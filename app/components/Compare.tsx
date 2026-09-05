"use client";

import { useMemo, useState } from "react";
import {
  branchLabel,
  eventsOnPath,
  leaves,
  pathTo,
  sortEvents,
  type Scenario,
} from "@/lib/scenario";
import { EventList, Legend } from "./Timeline";
import { useLang } from "./LangContext";

function Column({
  title,
  events,
  scenario,
  active,
  onSelect,
}: {
  title: string;
  events: ReturnType<typeof sortEvents>;
  scenario: Scenario;
  active: boolean;
  onSelect: () => void;
}) {
  const { t } = useLang();
  return (
    <div className="min-w-0 flex-1">
      <button
        onClick={onSelect}
        className={`w-full text-left text-xs mb-2 rounded-md px-2 py-1 border transition-colors ${
          active
            ? "border-black/30 dark:border-white/30 bg-black/[.04] dark:bg-white/[.06] font-medium"
            : "border-transparent text-zinc-600 dark:text-zinc-300 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
        }`}
        title={active ? t.shownTitle : t.showBranchTitle}
      >
        {title}
        {active && <span className="ml-1 text-[10px] font-mono uppercase text-zinc-400">{t.shown}</span>}
      </button>
      {events.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 pl-2">{t.noEventsBranch}</p>
      ) : (
        <EventList events={events} sources={scenario.sources} />
      )}
    </div>
  );
}

export function Compare({
  scenario,
  onShowBranch,
}: {
  scenario: Scenario;
  onShowBranch: (leafId: string) => void;
}) {
  const { t } = useLang();
  const tips = useMemo(() => leaves(scenario), [scenario]);
  const [pickA, setA] = useState<string>("");
  const [pickB, setB] = useState<string>("");

  // Default to the two most recent branches; fall back if a pick was deleted.
  const ids = tips.map((tip) => tip.id);
  const a = ids.includes(pickA) ? pickA : (ids[ids.length - 2] ?? "");
  const b = ids.includes(pickB) && pickB !== a ? pickB : (ids[ids.length - 1] ?? "");

  if (tips.length < 2) {
    return (
      <div className="text-sm text-zinc-500 dark:text-zinc-400 space-y-2">
        <p>{t.compareNeedsTwo}</p>
        <p>{t.compareHow(t.branchHere, t.edit)}</p>
      </div>
    );
  }

  const pathA = pathTo(scenario, a);
  const pathB = pathTo(scenario, b);
  let common = 0;
  while (common < pathA.length && common < pathB.length && pathA[common].id === pathB[common].id) common++;

  const shared = sortEvents(eventsOnPath(pathA.slice(0, common)));
  const onlyA = sortEvents(eventsOnPath(pathA.slice(common)));
  const onlyB = sortEvents(eventsOnPath(pathB.slice(common)));

  const select = (letter: string, value: string, set: (v: string) => void) => (
    <label className="flex items-center gap-2 text-xs">
      <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-500 w-3">
        {letter}
      </span>
      <select
        value={value}
        onChange={(e) => set(e.target.value)}
        className="min-w-0 flex-1 rounded-md border border-black/10 dark:border-white/15 bg-transparent px-2 py-1"
      >
        {tips.map((tip, i) => (
          <option key={tip.id} value={tip.id}>
            {i + 1}. {branchLabel(scenario, tip.id, t.branch)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        {select("A", a, setA)}
        {select("B", b, setB)}
      </div>
      <Legend />

      {shared.length > 0 && (
        <section>
          <h4 className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
            {t.sharedBeforeFork}
          </h4>
          <EventList events={shared} sources={scenario.sources} />
        </section>
      )}

      <section>
        <h4 className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
          {t.afterFork}
        </h4>
        <div className="flex gap-3">
          <Column
            title={`A · ${branchLabel(scenario, a, t.branch)}`}
            events={onlyA}
            scenario={scenario}
            active={scenario.leafId === a}
            onSelect={() => onShowBranch(a)}
          />
          <div className="w-px bg-zinc-200 dark:bg-zinc-800" />
          <Column
            title={`B · ${branchLabel(scenario, b, t.branch)}`}
            events={onlyB}
            scenario={scenario}
            active={scenario.leafId === b}
            onSelect={() => onShowBranch(b)}
          />
        </div>
      </section>
    </div>
  );
}
