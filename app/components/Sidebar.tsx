"use client";

import { useState } from "react";
import { fmtYear, timeAgo } from "@/lib/i18n";
import { branchCount, scenarioDisplayTitle, type Scenario } from "@/lib/scenario";
import { useLang } from "./LangContext";

export function Sidebar({
  scenarios,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  scenarios: Scenario[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const { lang, t } = useLang();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const sorted = [...scenarios].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <button
          onClick={onNew}
          className="w-full rounded-lg bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm font-medium hover:opacity-90"
        >
          {t.newScenario}
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {sorted.length === 0 && (
          <p className="px-2 pt-2 text-xs text-zinc-500 dark:text-zinc-400">{t.savedHere}</p>
        )}
        {sorted.map((s) => {
          const active = s.id === activeId;
          const branches = branchCount(s);
          const confirming = confirmId === s.id;
          return (
            <div
              key={s.id}
              className={`group rounded-lg text-sm ${
                active ? "bg-black/[.06] dark:bg-white/[.08]" : "hover:bg-black/[.03] dark:hover:bg-white/[.04]"
              }`}
            >
              <button onClick={() => onSelect(s.id)} className="w-full text-left px-2.5 py-2">
                <div className="truncate font-medium">{scenarioDisplayTitle(s, t.untitled)}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {s.divergenceYear !== null && <span className="font-mono">{fmtYear(s.divergenceYear, lang)}</span>}
                  {branches > 1 && <span>{t.branches(branches)}</span>}
                  <span className="ml-auto">{timeAgo(s.updatedAt, lang)}</span>
                </div>
              </button>
              {confirming ? (
                <div className="flex items-center gap-2 px-2.5 pb-2 text-xs">
                  <span className="text-zinc-500">{t.deleteQ}</span>
                  <button
                    onClick={() => {
                      onDelete(s.id);
                      setConfirmId(null);
                    }}
                    className="text-red-600 dark:text-red-400 font-medium"
                  >
                    {t.yes}
                  </button>
                  <button onClick={() => setConfirmId(null)} className="text-zinc-500">
                    {t.no}
                  </button>
                </div>
              ) : (
                <div className="px-2.5 pb-1.5 hidden group-hover:block">
                  <button
                    onClick={() => setConfirmId(s.id)}
                    className="text-[11px] text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
                  >
                    {t.delete}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
