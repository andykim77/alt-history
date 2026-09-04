"use client";

import { useState } from "react";
import { branchCount, scenarioDisplayTitle, type Scenario } from "@/lib/scenario";

function timeAgo(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

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
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const sorted = [...scenarios].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <button
          onClick={onNew}
          className="w-full rounded-lg bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm font-medium hover:opacity-90"
        >
          + New scenario
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {sorted.length === 0 && (
          <p className="px-2 pt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Scenarios are saved in this browser.
          </p>
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
                <div className="truncate font-medium">{scenarioDisplayTitle(s)}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {s.divergenceYear !== null && (
                    <span className="font-mono">{s.divergenceYear < 0 ? `${-s.divergenceYear} BCE` : s.divergenceYear}</span>
                  )}
                  {branches > 1 && <span>{branches} branches</span>}
                  <span className="ml-auto">{timeAgo(s.updatedAt)}</span>
                </div>
              </button>
              {confirming ? (
                <div className="flex items-center gap-2 px-2.5 pb-2 text-xs">
                  <span className="text-zinc-500">Delete?</span>
                  <button
                    onClick={() => {
                      onDelete(s.id);
                      setConfirmId(null);
                    }}
                    className="text-red-600 dark:text-red-400 font-medium"
                  >
                    Yes
                  </button>
                  <button onClick={() => setConfirmId(null)} className="text-zinc-500">
                    No
                  </button>
                </div>
              ) : (
                <div className="px-2.5 pb-1.5 hidden group-hover:block">
                  <button
                    onClick={() => setConfirmId(s.id)}
                    className="text-[11px] text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
                  >
                    Delete
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
