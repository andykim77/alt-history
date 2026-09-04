"use client";

import { formatYear } from "@/lib/scenario";
import type { LedgerEntry, Source } from "@/lib/types";

export function Ledger({ ledger, sources }: { ledger: LedgerEntry[]; sources: Source[] }) {
  if (ledger.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        A running ledger of what happened in our world versus what happens in this one,
        year by year.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[3rem_1fr_1fr] gap-x-2 px-1 font-mono text-[10px] uppercase text-zinc-400 dark:text-zinc-500">
        <span>Year</span>
        <span>Our world</span>
        <span className="text-sky-600 dark:text-sky-400">This world</span>
      </div>
      <ol className="divide-y divide-black/5 dark:divide-white/10 rounded-xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[.03]">
        {ledger.map((row, i) => {
          const src = row.source ? sources[row.source - 1] : undefined;
          return (
            <li key={i} className="grid grid-cols-[3rem_1fr_1fr] gap-x-2 px-2 py-2 text-[12.5px] leading-snug">
              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 pt-0.5">
                {formatYear(row.year)}
              </span>
              <span className="text-zinc-600 dark:text-zinc-400">
                {row.ours}
                {src && (
                  <a href={src.url} target="_blank" rel="noreferrer" className="cite ml-1" title={src.title}>
                    [{row.source}]
                  </a>
                )}
              </span>
              <span>{row.theirs}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
