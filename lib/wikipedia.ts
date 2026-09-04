// Minimal Wikipedia client used to ground pre-divergence history in real sources.

const API = "https://en.wikipedia.org/w/api.php";
const UA = "AltHistoryExplorer/0.2 (https://github.com/andykim77/alt-history)";

export type WikiPage = {
  title: string;
  url: string;
  extract: string;
};

async function wikiGet(params: Record<string, string>): Promise<unknown> {
  const url = new URL(API);
  Object.entries({ format: "json", formatversion: "2", origin: "*", ...params }).forEach(
    ([k, v]) => url.searchParams.set(k, v)
  );
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  return res.json();
}

/** Full-text search; returns page titles, best match first. */
export async function searchTitles(query: string, limit = 3): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const data = (await wikiGet({
      action: "query",
      list: "search",
      srsearch: q,
      srlimit: String(limit),
      srprop: "",
    })) as { query?: { search?: { title: string }[] } };
    return (data.query?.search ?? []).map((s) => s.title);
  } catch {
    return [];
  }
}

/** Fetch intro extracts for up to 20 titles in one call. Preserves input order. */
export async function fetchExtracts(titles: string[], maxChars = 2200): Promise<WikiPage[]> {
  const unique = [...new Set(titles.filter(Boolean))].slice(0, 20);
  if (unique.length === 0) return [];
  try {
    const data = (await wikiGet({
      action: "query",
      prop: "extracts|info",
      inprop: "url",
      exintro: "1",
      explaintext: "1",
      exlimit: "20",
      redirects: "1",
      titles: unique.join("|"),
    })) as {
      query?: {
        redirects?: { from: string; to: string }[];
        normalized?: { from: string; to: string }[];
        pages?: { title: string; fullurl?: string; extract?: string; missing?: boolean }[];
      };
    };
    const pages = (data.query?.pages ?? []).filter((p) => !p.missing && p.extract);
    // Map requested title -> resolved title so we can keep the caller's order.
    const rename = new Map<string, string>();
    for (const r of data.query?.normalized ?? []) rename.set(r.from, r.to);
    for (const r of data.query?.redirects ?? []) {
      // Chain normalized -> redirected.
      for (const [from, to] of rename) if (to === r.from) rename.set(from, r.to);
      rename.set(r.from, r.to);
    }
    const byTitle = new Map(pages.map((p) => [p.title, p]));
    const out: WikiPage[] = [];
    const seen = new Set<string>();
    for (const t of unique) {
      const resolved = rename.get(t) ?? t;
      const p = byTitle.get(resolved);
      if (!p || seen.has(p.title)) continue;
      seen.add(p.title);
      out.push({
        title: p.title,
        url: p.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`,
        extract: p.extract!.replace(/\s+\n/g, "\n").trim().slice(0, maxChars),
      });
    }
    return out;
  } catch {
    return [];
  }
}
