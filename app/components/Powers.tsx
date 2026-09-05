"use client";

import type { Posture, Power, Relation } from "@/lib/types";
import { EditableName } from "./EditableName";
import { useLang } from "./LangContext";

const POSTURE_CLS: Record<Posture, string> = {
  expanding: "text-emerald-700 dark:text-emerald-300 bg-emerald-500/15",
  emerging: "text-sky-700 dark:text-sky-300 bg-sky-500/15",
  consolidating: "text-zinc-700 dark:text-zinc-300 bg-zinc-500/15",
  defensive: "text-amber-700 dark:text-amber-300 bg-amber-500/15",
  fracturing: "text-orange-700 dark:text-orange-300 bg-orange-500/15",
  collapsing: "text-red-700 dark:text-red-300 bg-red-500/15",
};

const RELATION_CLS: Record<Relation, string> = {
  ally: "border-emerald-500/50 text-emerald-700 dark:text-emerald-300",
  trade: "border-sky-500/50 text-sky-700 dark:text-sky-300",
  neutral: "border-zinc-400/50 text-zinc-600 dark:text-zinc-400",
  vassal: "border-violet-500/50 text-violet-700 dark:text-violet-300",
  rival: "border-amber-500/60 text-amber-700 dark:text-amber-300",
  war: "border-red-500/60 text-red-700 dark:text-red-300",
};

function Strength({ n }: { n: number }) {
  const { t } = useLang();
  const tier = t.tier[n] ?? t.tier[3];
  return (
    <span className="inline-flex items-center gap-1.5" title={t.strength(n)} aria-label={`${tier}, ${t.strength(n)}`}>
      <span className="inline-flex gap-0.5" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`h-2 w-1.5 rounded-sm ${i <= n ? "bg-current" : "bg-current opacity-20"}`} />
        ))}
      </span>
      <span>{tier}</span>
    </span>
  );
}

export function Powers({
  powers,
  onRename,
}: {
  powers: Power[];
  onRename: (from: string, to: string) => void;
}) {
  const { t } = useLang();
  if (powers.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">{t.powersEmpty}</p>;
  }
  const sorted = [...powers].sort((a, b) => b.strength - a.strength);
  return (
    <ul className="space-y-3">
      {sorted.map((p) => {
        const posture: Posture = p.posture in POSTURE_CLS ? p.posture : "consolidating";
        return (
          <li
            key={p.name}
            className="rounded-xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[.03] p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-serif text-[15px] leading-tight">
                  <EditableName value={p.name} onRename={(next) => onRename(p.name, next)} />
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  <Strength n={p.strength} />
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${POSTURE_CLS[posture]}`}>
                {t.posture[posture]}
              </span>
            </div>
            {p.interests.length > 0 && (
              <div className="mt-2">
                <div className="font-mono text-[10px] uppercase text-zinc-400 dark:text-zinc-500 mb-1">{t.interests}</div>
                <ul className="space-y-1 text-[12.5px] leading-snug">
                  {p.interests.map((it, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-zinc-400 dark:text-zinc-500 select-none">›</span>
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {p.relations.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {p.relations.map((r, i) => {
                  const kind: Relation = r.kind in RELATION_CLS ? r.kind : "neutral";
                  return (
                    <span
                      key={i}
                      className={`rounded-full border px-2 py-0.5 text-[10.5px] leading-tight ${RELATION_CLS[kind]}`}
                      title={t.relation[kind]}
                    >
                      {kind === "war" ? "⚔ " : kind === "ally" ? "⚭ " : ""}
                      {r.with}
                      <span className="opacity-60"> · {t.relation[kind]}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
