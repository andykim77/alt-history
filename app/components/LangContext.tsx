"use client";

import { createContext, useContext } from "react";
import { STRINGS, type Lang, type Strings } from "@/lib/i18n";

export type LangValue = { lang: Lang; t: Strings; setLang: (lang: Lang) => void };

export const LangContext = createContext<LangValue>({ lang: "en", t: STRINGS.en, setLang: () => {} });

/** Current UI language and its strings. */
export function useLang(): LangValue {
  return useContext(LangContext);
}
