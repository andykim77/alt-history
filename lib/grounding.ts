// Grounding: figure out what the divergence is and which real-history sources to pull.

import { complete } from "./llm";
import { extractJsonObject } from "./openrouter";
import { fetchExtracts, searchTitles, type WikiPage } from "./wikipedia";
import type { ScenarioMeta } from "./types";

export type Grounding = {
  title: string;
  divergence: string;
  divergenceYear: number | null;
  pages: WikiPage[];
};

const MAX_SOURCES = 8;

type GroundingJson = {
  title?: string;
  divergence?: string;
  divergence_year?: number | string | null;
  queries?: string[];
};

const ANALYSIS_SYSTEM =
  "You extract structured data for an alternate-history app. Reply with ONLY a JSON object, no prose, no markdown fences.";

function analysisPrompt(prompt: string): string {
  return [
    "The user proposed this alternate-history scenario:",
    `"""${prompt}"""`,
    "",
    "Return JSON with:",
    '- "title": a short scenario title (max 8 words)',
    '- "divergence": one short sentence (max 30 words) stating the point of divergence from real history',
    '- "divergence_year": the calendar year of the divergence as an integer (negative for BCE), or null if unclear',
    '- "queries": 3 to 4 English Wikipedia search queries that would retrieve the REAL history immediately before and around the divergence (people, events, institutions, technologies involved). Use article-like names, e.g. "Printing press", "Johannes Gutenberg".',
  ].join("\n");
}

/** First turn: ask the model for the divergence point and 3-4 Wikipedia queries. */
async function analyzeDivergence(prompt: string): Promise<GroundingJson> {
  const text = await complete(
    [
      { role: "system", content: ANALYSIS_SYSTEM },
      { role: "user", content: analysisPrompt(prompt) },
    ],
    { maxTokens: 1200, temperature: 0.1 }
  );
  return extractJsonObject<GroundingJson>(text) ?? salvageAnalysis(text);
}

/** Pull fields out of a truncated or slightly malformed analysis reply. */
function salvageAnalysis(text: string): GroundingJson {
  const str = (key: string) => {
    const m = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(text);
    return m ? m[1].replace(/\\"/g, '"') : undefined;
  };
  const yearM = /"divergence_year"\s*:\s*(-?\d{1,4}|null)/.exec(text);
  const queries = [...text.matchAll(/"queries"\s*:\s*\[([\s\S]*)/g)]
    .flatMap((m) => [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((q) => q[1]))
    .slice(0, 4);
  const out: GroundingJson = {
    title: str("title"),
    divergence: str("divergence"),
    divergence_year: yearM && yearM[1] !== "null" ? parseInt(yearM[1], 10) : null,
    queries,
  };
  if (out.title) console.warn("[grounding] analysis JSON salvaged by regex");
  return out;
}

function fallbackTitle(prompt: string): string {
  const t = prompt.replace(/\s+/g, " ").trim();
  return t.length > 60 ? t.slice(0, 57) + "..." : t;
}

function toYear(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string") {
    const m = v.match(/-?\d{1,4}/);
    if (m) {
      const n = parseInt(m[0], 10);
      return /bc/i.test(v) && n > 0 ? -n : n;
    }
  }
  return null;
}

/** Strip "what if" framing so Wikipedia search sees the entities, not the question. */
export function searchQueryFromMessage(msg: string): string {
  return msg
    .replace(/^\s*(what|how|and|but|so|now)\s+(if|about|would|did|does|do|could|might)\b/i, "")
    .replace(/\b(never|instead|what happens|happens next|then|next)\b/gi, " ")
    .replace(/[?!.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/**
 * Build the grounding for this turn.
 * - New scenario: LLM analysis -> queries -> Wikipedia.
 * - Continuing: re-fetch the existing sources plus up to 2 new pages matching the
 *   latest user message (no extra LLM call, to stay within free-tier limits).
 */
export async function groundTurn(
  meta: ScenarioMeta,
  latestUserMessage: string,
  onStatus: (text: string) => void
): Promise<Grounding> {
  const isNew = !meta.title;
  let title = meta.title ?? "";
  let divergence = meta.divergence ?? "";
  let divergenceYear: number | null = meta.divergenceYear ?? null;
  let titles: string[] = [...(meta.sourceTitles ?? [])];

  if (isNew) {
    onStatus("Identifying the point of divergence...");
    let analysis: GroundingJson = {};
    try {
      analysis = await analyzeDivergence(latestUserMessage);
      if (!analysis.title) console.warn("[grounding] analysis returned no usable JSON");
    } catch (err) {
      // Fall through to heuristics; the narrator can still run with weaker grounding.
      console.warn("[grounding] analysis call failed:", err instanceof Error ? err.message : err);
    }
    title = (analysis.title || fallbackTitle(latestUserMessage)).trim();
    divergence = (analysis.divergence || latestUserMessage).trim();
    divergenceYear = toYear(analysis.divergence_year);

    const queries = (analysis.queries ?? []).filter((q) => typeof q === "string" && q.trim());
    if (queries.length === 0) queries.push(searchQueryFromMessage(latestUserMessage));

    onStatus("Checking real history on Wikipedia...");
    const results = await Promise.all(queries.slice(0, 4).map((q) => searchTitles(q, 2)));
    // Interleave: first hit of each query, then second hits.
    for (let i = 0; i < 2; i++) for (const r of results) if (r[i]) titles.push(r[i]);
  } else {
    onStatus("Checking real history on Wikipedia...");
    const q = searchQueryFromMessage(latestUserMessage);
    const found = q.length > 3 ? await searchTitles(q, 2) : [];
    titles.push(...found);
  }

  titles = [...new Set(titles)];
  // Keep the earliest sources (they anchor the divergence) and the newest additions.
  if (titles.length > MAX_SOURCES) {
    const keepOld = titles.slice(0, MAX_SOURCES - 2);
    const keepNew = titles.slice(-2);
    titles = [...new Set([...keepOld, ...keepNew])];
  }

  const pages = await fetchExtracts(titles);
  return { title, divergence, divergenceYear, pages: budgetExtracts(pages) };
}

/** Keep the total source text within the engine's prompt budget. */
function budgetExtracts(pages: WikiPage[]): WikiPage[] {
  if (pages.length === 0) return pages;
  const total = sourceBudgetChars();
  const per = Math.max(600, Math.floor(total / pages.length));
  return pages.map((p) => (p.extract.length > per ? { ...p, extract: p.extract.slice(0, per).trimEnd() + "…" } : p));
}

function sourceBudgetChars(): number {
  const env = Number(process.env.SOURCE_BUDGET_CHARS);
  if (Number.isFinite(env) && env > 0) return env;
  // The K-Oracle gateway rejects system prompts over 20k chars; leave room for the rules.
  return process.env.LLM_PROVIDER === "koracle" ? 13000 : 18000;
}
