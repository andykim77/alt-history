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
import { EventRow, Legend } from "./Timeline";

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
  return (
    <div className="min-w-0 flex-1">
      <button
        onClick={onSelect}
        className={`w-full text-left text-xs font-medium mb-2 rounded-md px-2 py-1 border transition-colors ${
          active
            ? "border-black/40 dark:border-white/40"
            : "border-transparent hover:bg-black/[.04] dark:hover:bg-white/[.06]"
        }`}
        title="Show this branch in the chat"
      >
        {title}
      </button>
      {events.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 pl-2">No events yet on this branch.</p>
      ) : (
        <ol className="space-y-2.5 border-l border-zinc-200 dark:border-zinc-800 ml-1 pl-2.5 py-1">
          {events.map((ev, i) => (
            <EventRow key={`${ev.year}-${i}`} ev={ev} sources={scenario.sources} compact />
          ))}
        </ol>
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
  const tips = useMemo(() => leaves(scenario), [scenario]);
  const [pickA, setA] = useState<string>("");
  const [pickB, setB] = useState<string>("");

  // Default to the two most recent branches; fall back if a pick was deleted.
  const ids = tips.map((t) => t.id);
  const a = ids.includes(pickA) ? pickA : (ids[ids.length - 2] ?? "");
  const b = ids.includes(pickB) && pickB !== a ? pickB : (ids[ids.length - 1] ?? "");

  if (tips.length < 2) {
    return (
      <div className="text-sm text-zinc-500 dark:text-zinc-400 space-y-2">
        <p>Compare needs at least two branches.</p>
        <p>
          Use <span className="font-medium">Branch here</span> on any reply, or{" "}
          <span className="font-medium">Edit</span> on one of your messages, to fork the
          scenario. Then come back to see the timelines side by side.
        </p>
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

  const select = (value: string, set: (v: string) => void) => (
    <select
      value={value}
      onChange={(e) => set(e.target.value)}
      className="w-full text-xs rounded-md border border-black/10 dark:border-white/15 bg-transparent px-2 py-1"
    >
      {tips.map((t, i) => (
        <option key={t.id} value={t.id}>
          {i + 1}. {branchLabel(scenario, t.id)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {select(a, setA)}
        {select(b, setB)}
      </div>
      <Legend />

      {shared.length > 0 && (
        <section>
          <h4 className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
            Shared before the fork
          </h4>
          <ol className="space-y-2.5 border-l border-zinc-200 dark:border-zinc-800 ml-1 pl-3 py-1">
            {shared.map((ev, i) => (
              <EventRow key={`${ev.year}-${i}`} ev={ev} sources={scenario.sources} />
            ))}
          </ol>
        </section>
      )}

      <section>
        <h4 className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
          After the fork
        </h4>
        <div className="flex gap-3">
          <Column
            title={`A · ${branchLabel(scenario, a)}`}
            events={onlyA}
            scenario={scenario}
            active={scenario.leafId === a}
            onSelect={() => onShowBranch(a)}
          />
          <div className="w-px bg-zinc-200 dark:bg-zinc-800" />
          <Column
            title={`B · ${branchLabel(scenario, b)}`}
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
