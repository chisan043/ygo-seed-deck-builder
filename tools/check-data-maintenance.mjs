import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { absoluteSampleDate, cardMaps, cardNameKey, readWindowCache, sanitizeSample, validateCardPayload } from "./data-utils.mjs";
import { discoverOcgList, discoverTcgLink, fetchCurrentRegulation, parseOcgList, parseTcgList } from "./limit-regulation-sources.mjs";

const cards = Array.from({ length: 120 }, (_, i) => ({ id: i + 1, name: `Card ${i}`, desc: "Effect", card_images: [], misc_info: [{ konami_id: i + 1000, beta_id: i + 100000 }] }));
const { ids } = cardMaps(cards);
const sample = { date: "2026-09-22", ageDays: 0, mainIds: cards.slice(0, 20).flatMap((card) => [card.id, card.id]), extraIds: [], sideIds: [] };
assert.equal(sanitizeSample({ ...sample, mainIds: [100000, ...sample.mainIds.slice(1)] }, ids).mainIds[0], 1);
assert.equal(sanitizeSample({ ...sample, mainIds: sample.mainIds.slice(1) }, ids), null, "incomplete decks must be rejected");
assert.equal(sanitizeSample({ ...sample, extraIds: [99999999] }, ids), null, "unknown cards must not be silently dropped");
assert.ok(!("ageDays" in sanitizeSample(sample, ids)), "snapshot age must never survive sanitation");
assert.equal(absoluteSampleDate("2 weeks ago", "2026-09-22T00:00:00.000Z"), "2026-09-08T00:00:00.000Z");
assert.throws(() => validateCardPayload({ data: [] }), /incomplete/);
assert.throws(() => validateCardPayload({ data: cards }, 14000), /incomplete/);

const tcg = `<h3>Effective from September 21, 2026</h3><table>${cards.map((card) => `<tr><td>Monster</td><td>${card.name}</td><td>Limited</td><td>Forbidden</td></tr>`).join("")}</table>`;
assert.equal(discoverTcgLink('<a href="/en/limited/list_2027-02-05/">View the list here</a>'), "https://www.yugioh-card.com/en/limited/list_2027-02-05/");
const tcgResult = parseTcgList(tcg, cards, "2026-10-08");
assert.equal(tcgResult.regulation[1000], 1, "TCG parser must read Advanced, not Traditional, limits");
assert.throws(() => parseTcgList(tcg, cards, "2026-09-01"), /not effective/);
assert.throws(() => parseTcgList("<h3>Effective from September 21, 2026</h3>", cards), /incomplete/);
const deferred = `${tcg}<p>The changes to "Card 0" from Limited to Unlimited do not take effect until October 20, 2026.</p>`;
assert.equal(parseTcgList(deferred, cards, "2026-10-08").regulation[1000], 1);

const ocgLinks = '<a href="?list=202610">最新版：2026年10月01日適用</a><a href="?list=202607">2026年07月01日適用</a>';
assert.equal(discoverOcgList(ocgLinks, "2026-09-20").date, "2026-07-01");
const ocg = `<h2>禁止カード（120枚）</h2><table>${cards.map((card) => `<tr><td class="cell-ocg">和名${card.id}</td><td class="cell-tcg">${card.id === 1 ? "Different translation" : card.name}</td></tr>`).join("")}</table><h2>制限解除されたカード（1枚）</h2><table><tr><td class="cell-tcg">Card 0</td></tr></table>`;
const aliases = new Map([[cardNameKey("和名1"), cards[0]]]);
assert.equal(parseOcgList(ocg, cards, aliases)[1000], 0, "Japanese aliases resolve unofficial English translations; unlimited sections must not override bans");
assert.throws(() => parseOcgList(ocg.replace("120枚", "121枚"), cards, aliases), /incomplete/);

const currentUrl = "https://www.yugioh-card.com/en/limited/list_2026-09-21/";
const mockPages = new Map([["https://www.yugioh-card.com/en/limited/", `<a href="${currentUrl}">View the list here</a>`], [currentUrl, tcg]]);
const current = await fetchCurrentRegulation("tcg", cards, { today: "2026-10-08", fetcher: async (url) => mockPages.get(url) });
assert.equal(current.date, "2026-09-21");
assert.match(current.source, /KONAMI/, "TCG must never depend on the lagging mirror");

// Exercise the real cache code in an isolated directory, including a failed refresh.
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "ygo-cache-test-"));
const previousDir = process.env.YGO_DATA_DIR;
process.env.YGO_DATA_DIR = temporary;
try {
  const originalCards = JSON.parse(await fs.readFile(new URL("../data/cardinfo-cache.json", import.meta.url), "utf8"));
  await fs.writeFile(path.join(temporary, "cardinfo-cache.json"), JSON.stringify(originalCards));
  // data-utils is already imported above, so load the server in a child process
  // to ensure its configured data path cannot touch the project's working data.
  const { spawnSync } = await import("node:child_process");
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import fs from 'node:fs/promises';
    import path from 'node:path';
    import { getCachedDeckSearch } from ${JSON.stringify(new URL("./serve-with-refresh.mjs", import.meta.url).href)};
    const db=JSON.parse(await fs.readFile(path.join(process.env.YGO_DATA_DIR,'cardinfo-cache.json'),'utf8'));
    const mainIds=db.data.slice(0,20).flatMap(c=>[c.id,c.id]);
    const descriptor={type:'archetype',name:'Regression',format:'md',limit:48};
    const first=await getCachedDeckSearch(descriptor,async()=>[{mainIds,extraIds:[],sideIds:[],date:'2026-09-22',ageDays:0}],{forceRefresh:true});
    const file=path.join(process.env.YGO_DATA_DIR,'deck-search-cache',first.cacheKey+'.json');
    const before=await fs.readFile(file,'utf8');
    const fallback=await getCachedDeckSearch(descriptor,async()=>{throw Error('network unavailable');},{forceRefresh:true});
    assert.equal(fallback.stale,true);assert.equal(fallback.samples.length,1);
    assert.equal(await fs.readFile(file,'utf8'),before,'network failures must preserve the last good cache');
    const empty=await getCachedDeckSearch(descriptor,async()=>[],{forceRefresh:true});
    assert.equal(empty.stale,true);assert.equal(empty.samples.length,1);
    assert.equal(await fs.readFile(file,'utf8'),before,'empty sources must not replace good data');
  `], { env: process.env, encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
} finally {
  if (previousDir === undefined) delete process.env.YGO_DATA_DIR;
  else process.env.YGO_DATA_DIR = previousDir;
  await fs.rm(temporary, { recursive: true, force: true });
}

// Test the frontend's actual age helper with a fixed clock.
const app = await fs.readFile(new URL("../app.js", import.meta.url), "utf8");
const ageHelper = app.match(/function publicSampleAgeDays\([^)]*\) \{[\s\S]*?\n\}/)[0];
const context = { Date: class extends Date { static now() { return Date.parse("2026-10-08T00:00:00Z"); } } };
vm.createContext(context);
vm.runInContext(ageHelper, context);
assert.equal(context.publicSampleAgeDays({ date: "2026-09-22T00:00:00Z", ageDays: 0 }), 16, "old ageDays must not make historical samples recent");

const liveContext = {
  state: { allCards: [cards[0]], searchIndex: [cards[0]], localeById: new Map(), masterDuelLocaleData: {} },
  CAN_USE_LOCAL_API: true, CARDINFO_URL: "/api/cardinfo", masterDuelLocalePromise: Promise.resolve({}),
  fetchAliasSearchData: async () => ({ entries: [] }),
  ensureMasterDuelLocaleData: async () => ({}),
  fetch: async () => ({ ok: true, json: async () => ({ data: cards.slice(0, 2) }) }),
  buildCardIdMap: (rows) => new Map(rows.map((card) => [card.id, card])),
  buildInferredArchetypeLocales: () => ({}), buildSearchIndex: (rows) => rows,
};
vm.createContext(liveContext);
vm.runInContext(app.match(/async function loadAllCards[^\n]*\{[\s\S]*?\n\}/)[0], liveContext);
await liveContext.loadAllCards({ forceRefresh: true });
assert.equal(liveContext.state.allCards.length, 2, "background updates must replace the in-memory card index without a reload");

const cache = await readWindowCache(new URL("../data/deck-search-cache.js", import.meta.url));
assert.ok(cache.entries.length > 0);
console.log("data maintenance regression checks passed");
