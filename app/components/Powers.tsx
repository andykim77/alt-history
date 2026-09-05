"use client";

import { norm } from "@/lib/scenario";
import type { Posture, Power, Relation } from "@/lib/types";
import { EditableName } from "./EditableName";
import { useLang } from "./LangContext";
import { PillMenu } from "./PillMenu";

const POSTURE_ORDER: Posture[] = [
  "hegemon",
  "expanding",
  "emerging",
  "consolidating",
  "defensive",
  "fracturing",
  "collapsing",
  "fallen",
];

const POSTURE_CLS: Record<Posture, string> = {
  hegemon: "text-purple-700 dark:text-purple-200 bg-purple-500/20 ring-1 ring-purple-500/40",
  expanding: "text-emerald-700 dark:text-emerald-300 bg-emerald-500/15",
  emerging: "text-sky-700 dark:text-sky-300 bg-sky-500/15",
  consolidating: "text-zinc-700 dark:text-zinc-300 bg-zinc-500/15",
  defensive: "text-amber-700 dark:text-amber-300 bg-amber-500/15",
  fracturing: "text-orange-700 dark:text-orange-300 bg-orange-500/15",
  collapsing: "text-red-700 dark:text-red-300 bg-red-500/15",
  fallen: "text-white bg-black dark:bg-black dark:text-zinc-200 dark:ring-1 dark:ring-white/25",
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
  overrides,
  onRename,
  onSetPosture,
}: {
  powers: Power[];
  /** Postures the user set by hand, keyed by normalised name. */
  overrides?: Record<string, Posture>;
  onRename: (from: string, to: string) => void;
  onSetPosture: (name: string, posture: Posture | null) => void;
}) {
  const { t } = useLang();
  const postureOptions = POSTURE_ORDER.map((v) => ({ value: v, label: t.posture[v], cls: POSTURE_CLS[v] }));
  if (powers.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">{t.powersEmpty}</p>;
  }
  const sorted = [...powers].sort((a, b) => b.strength - a.strength);
  return (
    <ul className="space-y-3">
      {sorted.map((p) => {
        const posture: Posture = p.posture in POSTURE_CLS ? p.posture : "consolidating";
        const fallen = posture === "fallen";
        return (
          <li
            key={p.name}
            className={`rounded-xl border p-3 ${
              fallen
                ? "border-black/20 dark:border-white/15 bg-black/[.04] dark:bg-white/[.02] opacity-75"
                : "border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[.03]"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className={`font-serif text-[15px] leading-tight ${fallen ? "line-through decoration-black/40 dark:decoration-white/40" : ""}`}>
                  <EditableName value={p.name} onRename={(next) => onRename(p.name, next)} />
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  <Strength n={p.strength} />
                </div>
              </div>
              <PillMenu
                value={posture}
                options={postureOptions}
                overridden={!!overrides?.[norm(p.name)]}
                title={t.postureTitle}
                onChange={(next) => onSetPosture(p.name, next)}
              />
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
