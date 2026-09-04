// Visual audit: seeds a deterministic scenario into localStorage and screenshots every
// panel in light/dark at desktop, tablet and mobile widths. No LLM calls.
// Usage: npm run dev (in another terminal), then `npm run audit:ui` (set CHROME_PATH if Chrome is elsewhere).
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE || "http://localhost:3000";
const OUT = process.env.OUT || "./ui-audit";
import { mkdirSync } from "node:fs";
mkdirSync(OUT, { recursive: true });

// ---- deterministic seed: one scenario, two branches, full dossier ----
const now = Date.now();
const id = (n) => `n${n}`;
const src = [
  { n: 1, title: "Fall of Constantinople", url: "https://en.wikipedia.org/wiki/Fall_of_Constantinople", snippet: "Constantinople, the capital city of the Byzantine Empire, was captured by the Ottoman Empire on 29 May 1453 as part of the culmination of a 53-day siege." },
  { n: 2, title: "Constantine XI Palaiologos", url: "https://en.wikipedia.org/wiki/Constantine_XI_Palaiologos", snippet: "Constantine XI Dragases Palaiologos was the last Byzantine emperor, reigning from 1449 until his death in battle at the Fall of Constantinople in 1453." },
  { n: 3, title: "Mehmed II", url: "https://en.wikipedia.org/wiki/Mehmed_II", snippet: "Mehmed II, commonly known as Mehmed the Conqueror, was twice the sultan of the Ottoman Empire from August 1444 to September 1446 and then later from February 1451 to May 1481." },
  { n: 4, title: "Theodosian Walls", url: "https://en.wikipedia.org/wiki/Walls_of_Constantinople", snippet: "The Walls of Constantinople are a series of defensive stone walls that have surrounded and protected the city of Constantinople since its founding as the new capital of the Roman Empire." },
];
const u1 = {
  events: [
    { year: 1453, month: 4, day: 6, label: "Ottoman siege of Constantinople begins", type: "history", source: 1 },
    { year: 1453, month: 5, day: 29, label: "Final Ottoman assault repulsed; Giustiniani holds the stockade at the St. Romanus gate", type: "divergence", source: null },
    { year: 1453, month: 6, day: null, label: "Mehmed II withdraws the Ottoman army to Adrianople", type: "alt", source: null },
    { year: 1454, month: null, day: null, label: "Constantine XI seeks dynastic alliances and Western aid", type: "alt", source: null },
  ],
  figures: [
    { name: "Constantine XI Palaiologos", role: "Byzantine Emperor", faction: "Byzantine Empire", status: "rising", realFate: "Died fighting on the walls on 29 May 1453; body never identified.", altFate: "Survives the assault; hailed as the saviour of the City and begins courting Western allies.", source: 2 },
    { name: "Mehmed II", role: "Ottoman Sultan", faction: "Ottoman Empire", status: "declining", realFate: "Took the city and ruled until 1481 as 'the Conqueror'.", altFate: "Humiliated; faces Janissary unrest and a resurgent Halil Pasha faction at court.", source: 3 },
    { name: "Giovanni Giustiniani", role: "Genoese condottiero", faction: "Republic of Genoa", status: "stable", realFate: "Wounded during the final assault and died of his wounds days later on Chios.", altFate: "Lightly wounded but stays at his post; the Genoese contingent holds.", source: 1 },
  ],
  powers: [
    { name: "Byzantine Empire", kind: "empire", strength: 2, posture: "defensive", interests: ["Secure Western military aid without surrendering the Church to Rome", "Rebuild the Theodosian Walls before the next campaign season", "Keep the Genoese and Venetians committed to the City's defence"], relations: [{ with: "Ottoman Empire", kind: "war" }, { with: "Republic of Genoa", kind: "ally" }, { with: "Republic of Venice", kind: "trade" }] },
    { name: "Ottoman Empire", kind: "empire", strength: 5, posture: "consolidating", interests: ["Restore the Sultan's prestige after the failed siege", "Neutralise Constantinople's harbour before another attempt", "Prevent a Christian coalition forming in the Balkans"], relations: [{ with: "Byzantine Empire", kind: "war" }, { with: "Republic of Venice", kind: "rival" }, { with: "Kingdom of Hungary", kind: "rival" }] },
    { name: "Republic of Genoa", kind: "republic", strength: 3, posture: "consolidating", interests: ["Protect the Galata colony and Black Sea trade", "Extract commercial privileges from a grateful emperor"], relations: [{ with: "Byzantine Empire", kind: "ally" }, { with: "Republic of Venice", kind: "rival" }] },
  ],
  ledger: [
    { year: 1453, ours: "Constantinople falls; the Byzantine Empire ends after eleven centuries.", theirs: "The walls hold; the Empire survives as a city-state under Constantine XI.", source: 1 },
    { year: 1454, ours: "Mehmed II consolidates his conquest and moves his capital to the City.", theirs: "Mehmed II returns to Adrianople to face a restive court and army.", source: null },
  ],
  flashpoints: [
    "Does Constantine XI accept papal terms for a crusade, risking revolt in his own Church?",
    "Can Mehmed II survive the Janissaries' anger, or does a palace coup follow the failed siege?",
    "Will Venice and Genoa cooperate to keep the Golden Horn open, or turn on each other?",
  ],
};
const u2 = {
  events: [
    { year: 1455, month: 3, day: null, label: "Papal legate arrives with terms for a new crusade", type: "alt", source: null },
    { year: 1456, month: 7, day: 22, label: "Hunyadi breaks the Ottoman siege of Belgrade with Byzantine envoys present", type: "alt", source: null },
  ],
  figures: [{ name: "John Hunyadi", role: "Regent-Governor of Hungary", faction: "Kingdom of Hungary", status: "rising", realFate: "Won at Belgrade in 1456 and died of plague weeks later.", altFate: "Victor of Belgrade and the natural leader of a Christian league.", source: null }],
  powers: [{ name: "Kingdom of Hungary", kind: "kingdom", strength: 3, posture: "expanding", interests: ["Push the Ottoman frontier back beyond the Danube", "Lead, not follow, any crusade"], relations: [{ with: "Ottoman Empire", kind: "war" }, { with: "Byzantine Empire", kind: "ally" }] }],
  ledger: [{ year: 1456, ours: "Belgrade holds; Hunyadi dies of plague.", theirs: "Belgrade holds and a Christian league forms around Hunyadi.", source: null }],
  flashpoints: ["Does the Byzantine Church accept Union with Rome as the price of the league?", "Who commands the league's fleet: Venice or Genoa?", "Does Mehmed II strike Hungary or Constantinople first?"],
};
const u3 = {
  events: [
    { year: 1455, month: null, day: null, label: "Janissary revolt in Adrianople; Halil Pasha regains influence", type: "alt", source: null },
    { year: 1457, month: null, day: null, label: "Mehmed II deposed in favour of his son Bayezid under a regency", type: "alt", source: null },
  ],
  figures: [{ name: "Mehmed II", role: "Deposed Ottoman Sultan", faction: "Ottoman Empire", status: "dead", realFate: "Took the city and ruled until 1481 as 'the Conqueror'.", altFate: "Deposed and quietly strangled in 1457; remembered as Mehmed the Unlucky.", source: 3 }],
  powers: [{ name: "Ottoman Empire", kind: "empire", strength: 4, posture: "fracturing", interests: ["Stabilise the succession under a child sultan", "Hold Rumelia against Hungarian pressure"], relations: [{ with: "Byzantine Empire", kind: "neutral" }, { with: "Kingdom of Hungary", kind: "war" }] }],
  ledger: [{ year: 1457, ours: "Mehmed II secure on his throne, campaigning in Serbia.", theirs: "Mehmed II deposed; Ottoman court fractures under a regency.", source: null }],
  flashpoints: ["Does Constantine XI exploit the regency to retake Thracian towns?", "Which faction controls the young Bayezid?", "Do the Karamanids rise in Anatolia?"],
};
const prose1 = `When **Mehmed II**'s great bombard first roared against the Theodosian Walls on 6 April 1453, the defenders flinched, but the masonry held [4]. In our timeline the walls, patched and undermanned, gave way at the St. Romanus gate on the morning of 29 May [1]. Here, a chance musket ball misses **Giovanni Giustiniani**, the Genoese captain whose withdrawal broke the defence, and the stockade holds through the third assault [1].

The Sultan, twenty-one years old and staking his reign on the City, watches the Janissaries recoil from the breach. By nightfall the assault has failed and the camp is muttering about Halil Pasha's warnings. Within days the Ottoman army withdraws to Adrianople, its prestige badly dented.

**Constantine XI Palaiologos**, who in our history died on the walls [2], instead finds himself the most celebrated man in Christendom, an emperor of a single city with a suddenly interested West. Which lifeline does he reach for first?`;
const prose2 = `The papal legate arrives in March 1455 with terms that would have been unthinkable two years earlier: a crusade preached across Europe, Venetian and Genoese galleys under a single admiral, and Hungarian troops on the Danube. The price is Union with Rome.

**John Hunyadi**, fresh from breaking the siege of Belgrade, becomes the natural leader of the league. Constantine XI walks a knife-edge between his Latin allies and his own clergy. Does he pay the price?`;
const prose3 = `The failed siege poisons the Ottoman court. The Janissaries, unpaid and humiliated, riot in Adrianople in 1455, and the old vizier Halil Pasha, whom Mehmed had sidelined, returns to influence. By 1457 the young Sultan is deposed in favour of his infant son **Bayezid**, with a regency council that answers to the army.

Constantinople watches the Ottoman fracture with cautious relief. But a fractured neighbour is not a safe one.`;

const nodes = {};
const add = (n, parent, role, content, update, sources) => {
  nodes[id(n)] = { id: id(n), parentId: parent === null ? null : id(parent), role, content, events: update?.events ?? [], update, sources, createdAt: now - (100 - n) * 60000 };
};
add(1, null, "user", "What if Byzantium never fell in 1453?");
add(2, 1, "assistant", prose1, u1, src);
add(3, 2, "user", "What does the West actually send, and at what price?");
add(4, 3, "assistant", prose2, u2, src);
add(5, 2, "user", "Instead, what happens inside the Ottoman court after the humiliation?");
add(6, 5, "assistant", prose3, u3, src);

const scenario = {
  id: "seed-byz", title: "Byzantium Endures: The Walls Hold", divergence: "The Ottoman assault on 29 May 1453 fails and Constantinople does not fall to Mehmed II.",
  divergenceYear: 1453, grounded: true, sourceTitles: src.map((s) => s.title), sources: src, engine: "claude-sonnet-5 via K-Oracle",
  renames: {}, nodes, leafId: id(4), createdAt: now - 7200000, updatedAt: now - 60000,
};
const second = { ...scenario, id: "seed-alex", title: "The Library of Alexandria Endures", divergence: "The Library survives Caesar's fire in 48 BCE.", divergenceYear: -48, nodes: { a1: { id: "a1", parentId: null, role: "user", content: "What if the Library of Alexandria never burned?", events: [], createdAt: now - 90000000 }, a2: { id: "a2", parentId: "a1", role: "assistant", content: "A short reply.", events: [], update: { events: [], figures: [], powers: [], ledger: [], flashpoints: [] }, createdAt: now - 89000000 } }, leafId: "a2", updatedAt: now - 86400000 * 3 };
const store = { version: 1, scenarios: [second, scenario], activeId: "seed-byz" };

// ---- drive ----
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--no-sandbox"],
});
const errors = [];

async function session(scheme, width, height, prefix) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(prefix + ": " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(prefix + " console: " + m.text()); });
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  await page.evaluateOnNewDocument((s) => { localStorage.setItem("alt-history:store:v1", JSON.stringify(s)); }, store);
  await page.goto(BASE, { waitUntil: "networkidle0" });
  const shot = (name) => page.screenshot({ path: `${OUT}/${prefix}-${name}.png` });
  const tab = async (label) => {
    await page.evaluate((t) => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().toLowerCase().startsWith(t)); b?.click(); }, label.toLowerCase());
    await new Promise((r) => setTimeout(r, 250));
  };
  return { page, shot, tab };
}

// Desktop light + dark
for (const scheme of ["light", "dark"]) {
  const { page, shot, tab } = await session(scheme, 1440, 900, `desk-${scheme}`);
  await shot("timeline");
  for (const t of ["figures", "powers", "changes", "sources", "compare"]) { await tab(t); await shot(t); }
  // scroll thread to top to see first reply + user bubble
  await page.evaluate(() => { const el = document.querySelector("main .overflow-y-auto"); if (el) el.scrollTop = 0; });
  await tab("timeline");
  await shot("thread-top");
  // Hover a figure card to reveal the pencil
  await tab("figures");
  const card = await page.$("main ~ aside li");
  if (card) { await card.hover(); await shot("figures-hover"); }
  await page.close();
}

// Narrow desktop (1024) and tablet (900) — panel breakpoints
for (const [w, h, name] of [[1100, 800, "narrow"], [820, 1000, "tablet"]]) {
  const { page, shot, tab } = await session("light", w, h, name);
  await shot("timeline");
  if (w < 1024) {
    await tab("dossier");
    await shot("drawer");
  }
  await page.close();
}

// Mobile
{
  const { page, shot, tab } = await session("light", 390, 800, "mobile");
  await shot("thread");
  await tab("dossier"); await shot("drawer-timeline");
  await tab("powers"); await shot("drawer-powers");
  await tab("compare"); await shot("drawer-compare");
  await page.evaluate(() => document.querySelector('button[aria-label="Scenarios"]')?.click()); await new Promise((r) => setTimeout(r, 250));
  await shot("drawer-left");
  await page.close();
}

// Empty state light/dark
for (const scheme of ["light", "dark"]) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  await page.evaluateOnNewDocument(() => localStorage.clear());
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await page.screenshot({ path: `${OUT}/empty-${scheme}.png` });
  await page.close();
}

console.log("errors:", errors.length ? errors : "none");
await browser.close();
