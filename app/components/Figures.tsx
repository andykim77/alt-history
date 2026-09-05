"use client";

import type { Figure, FigureStatus, Source } from "@/lib/types";
import { EditableName } from "./EditableName";

const STATUS: Record<FigureStatus, { label: string; cls: string }> = {
  rising: { label: "rising", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  stable: { label: "stable", cls: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300" },
  declining: { label: "declining", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  dead: { label: "dead", cls: "bg-red-500/15 text-red-700 dark:text-red-300" },
  unknown: { label: "unknown", cls: "bg-zinc-500/10 text-zinc-500" },
};

export function Figures({
  figures,
  sources,
  onRename,
}: {
  figures: Figure[];
  sources: Source[];
  onRename: (from: string, to: string) => void;
}) {
  if (figures.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        People who shape the scenario will be tracked here: who they are, what became of
        them in our world, and what is becoming of them in this one.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {figures.map((f) => {
        const src = f.source ? sources[f.source - 1] : undefined;
        const st = STATUS[f.status] ?? STATUS.unknown;
        return (
          <li
            key={f.name}
            className="rounded-xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[.03] p-3"
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
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                  {f.role}
                  {f.faction && <span> · {f.faction}</span>}
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${st.cls}`}>
                {st.label}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[12.5px] leading-snug">
              <dt className="text-zinc-400 dark:text-zinc-500 font-mono text-[10px] uppercase pt-0.5">Ours</dt>
              <dd className="text-zinc-600 dark:text-zinc-400">
                {f.realFate || "—"}
                {src && (
                  <a href={src.url} target="_blank" rel="noreferrer" className="cite ml-1" title={src.title}>
                    [{f.source}]
                  </a>
                )}
              </dd>
              <dt className="text-sky-600 dark:text-sky-400 font-mono text-[10px] uppercase pt-0.5">Here</dt>
              <dd>{f.altFate || "—"}</dd>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
