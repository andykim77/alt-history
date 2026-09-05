"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "./LangContext";

/**
 * A name that turns into an input on click (or via the pencil). Enter saves,
 * Escape cancels, blur saves. Renders children (e.g. a link) when idle.
 */
export function EditableName({
  value,
  onRename,
  className,
  children,
}: {
  value: string;
  onRename: (next: string) => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const { t } = useLang();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== value) onRename(next);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        maxLength={80}
        className={`w-full bg-transparent border-b border-black/30 dark:border-white/40 outline-none ${className ?? ""}`}
        aria-label={t.editName}
      />
    );
  }

  return (
    <span className={`group/name flex items-baseline gap-1 max-w-full ${className ?? ""}`}>
      <span className="min-w-0 break-words">{children ?? value}</span>
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="shrink-0 opacity-0 group-hover/name:opacity-60 focus:opacity-100 hover:!opacity-100 text-[11px] leading-none transition-opacity"
        title={t.rename}
        aria-label={`${t.rename}: ${value}`}
      >
        ✎
      </button>
    </span>
  );
}
