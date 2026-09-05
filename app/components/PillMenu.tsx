"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "./LangContext";

export type PillOption<T extends string> = { value: T; label: string; cls: string };

/**
 * A status pill that opens a scrollable menu of the other values on click.
 * `overridden` marks a value the user chose by hand; the menu then offers a
 * way back to the narrator's own value.
 */
export function PillMenu<T extends string>({
  value,
  options,
  overridden,
  title,
  onChange,
}: {
  value: T;
  options: PillOption<T>[];
  overridden: boolean;
  /** Menu heading, e.g. "Posture". */
  title: string;
  /** null = clear the user's choice. */
  onChange: (next: T | null) => void;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`${title}${overridden ? ` · ${t.setByYou}` : ""}`}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide cursor-pointer transition-shadow hover:shadow-[0_0_0_2px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_0_0_2px_rgba(255,255,255,0.18)] ${current.cls}`}
      >
        {current.label}
        {overridden && <span aria-hidden className="opacity-70">✎</span>}
        <span aria-hidden className="opacity-60 text-[8px]">▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={title}
          className="absolute right-0 z-30 mt-1 w-44 max-h-56 overflow-y-auto rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-zinc-900 shadow-lg p-1"
        >
          <div className="px-2 pt-1 pb-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            {title}
          </div>
          {options.map((o) => (
            <button
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onClick={() => {
                setOpen(false);
                if (o.value !== value) onChange(o.value);
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] hover:bg-black/[.05] dark:hover:bg-white/[.08] ${
                o.value === value ? "font-medium" : ""
              }`}
            >
              <span className={`inline-block rounded-full px-1.5 py-px text-[9px] uppercase tracking-wide ${o.cls}`}>
                {o.label}
              </span>
              {o.value === value && <span className="ml-auto text-zinc-400 text-[10px]">●</span>}
            </button>
          ))}
          {overridden && (
            <button
              onClick={() => {
                setOpen(false);
                onChange(null);
              }}
              className="mt-1 flex w-full items-center rounded-lg border-t border-black/5 dark:border-white/10 px-2 py-1.5 text-left text-[11.5px] text-zinc-500 dark:text-zinc-400 hover:bg-black/[.05] dark:hover:bg-white/[.08]"
            >
              {t.backToNarrator}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
