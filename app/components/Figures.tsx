"use client";

import { useState } from "react";
import { norm } from "@/lib/scenario";
import type { Figure, FigureStatus, Source } from "@/lib/types";
import { EditableName } from "./EditableName";
import { useLang } from "./LangContext";
import { PillMenu } from "./PillMenu";

const STATUS_ORDER: FigureStatus[] = ["dominant", "rising", "stable", "declining", "wounded", "ill", "dead", "unknown"];

const STATUS_CLS: Record<FigureStatus, string> = {
  dominant: "bg-blue-500/15 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/40",
  rising: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  stable: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  declining: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  wounded: "bg-red-500/15 text-red-700 dark:text-red-300",
  ill: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  dead: "bg-black text-white dark:bg-black dark:text-zinc-200 dark:ring-1 dark:ring-white/25",
  unknown: "bg-zinc-500/10 text-zinc-500",
};

type Group = { faction: string; figures: Figure[] };

/** Figures grouped under their faction, in first-seen order; blank factions last. */
function groupByFaction(figures: Figure[], unaffiliated: string): Group[] {
  const groups = new Map<string, Group>();
  for (const f of figures) {
    const key = f.faction ? norm(f.faction) : "";
    let g = groups.get(key);
    if (!g) {
      g = { faction: f.faction || unaffiliated, figures: [] };
      groups.set(key, g);
    }
    g.figures.push(f);
  }
  const out = [...groups.entries()];
  const blank = out.find(([k]) => k === "");
  return [...out.filter(([k]) => k !== "").map(([, g]) => g), ...(blank ? [blank[1]] : [])];
}

export function Figures({
  figures,
  sources,
  overrides,
  onRename,
  onSetStatus,
}: {
  figures: Figure[];
  sources: Source[];
  /** Statuses the user set by hand, keyed by normalised name. */
  overrides?: Record<string, FigureStatus>;
  onRename: (from: string, to: string) => void;
  onSetStatus: (name: string, status: FigureStatus | null) => void;
}) {
  const { t } = useLang();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const statusOptions = STATUS_ORDER.map((v) => ({ value: v, label: t.figureStatus[v], cls: STATUS_CLS[v] }));

  if (figures.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">{t.figuresEmpty}</p>;
  }

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="space-y-3">
      {groupByFaction(figures, t.unaffiliated).map((g) => {
        const key = norm(g.faction);
        const open = !collapsed.has(key);
        const dead = g.figures.filter((f) => f.status === "dead").length;
        return (
          <section key={key}>
            <button
              onClick={() => toggle(key)}
              aria-expanded={open}
              className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-black/[.04] dark:hover:bg-white/[.06]"
            >
              <span
                aria-hidden
                className={`inline-block text-[10px] text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`}
              >
                ▶
              </span>
              <span className="font-serif text-[14px] font-medium leading-none">{g.faction}</span>
              <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
              <span className="font-mono text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">
                {g.figures.length}
                {dead > 0 && <span className="ml-1 opacity-70">†{dead}</span>}
              </span>
            </button>
            {open && (
              <ul className="mt-1.5 space-y-2 pl-1">
                {g.figures.map((f) => {
                  const src = f.source ? sources[f.source - 1] : undefined;
                  const status: FigureStatus = f.status in STATUS_CLS ? f.status : "unknown";
                  const gone = status === "dead";
                  return (
                    <li
                      key={f.name}
                      className={`rounded-xl border p-3 ${
                        gone
                          ? "border-black/20 dark:border-white/15 bg-black/[.04] dark:bg-white/[.02] opacity-75"
                          : "border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[.03]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-serif text-[15px] leading-tight">
                            <EditableName value={f.name} onRename={(next) => onRename(f.name, next)}>
                              {src ? (
                                <a href={src.url} target="_blank" rel="noreferrer" className="hover:underline">
                                  {f.name}
                                </a>
                              ) : (
                                f.name
                              )}
                            </EditableName>
                          </div>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">{f.role}</div>
                        </div>
                        <PillMenu
                          value={status}
                          options={statusOptions}
                          overridden={!!overrides?.[norm(f.name)]}
                          title={t.statusTitle}
                          onChange={(next) => onSetStatus(f.name, next)}
                        />
                      </div>
                      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[12.5px] leading-snug">
                        <dt className="text-zinc-400 dark:text-zinc-500 font-mono text-[10px] uppercase pt-0.5">{t.ours}</dt>
                        <dd className="text-zinc-600 dark:text-zinc-400">
                          {f.realFate || "—"}
                          {src && (
                            <a href={src.url} target="_blank" rel="noreferrer" className="cite ml-1" title={src.title}>
                              [{f.source}]
                            </a>
                          )}
                        </dd>
                        <dt className="text-sky-600 dark:text-sky-400 font-mono text-[10px] uppercase pt-0.5">{t.here}</dt>
                        <dd>{f.altFate || "—"}</dd>
                      </dl>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
