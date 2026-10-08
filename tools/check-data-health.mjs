import assert from "node:assert/strict";
import path from "node:path";
import { DATA_DIR, cardMaps, readJson, readWindowCache, sanitizeSample, validateCardPayload } from "./data-utils.mjs";

const payload = validateCardPayload(await readJson(path.join(DATA_DIR, "cardinfo-cache.json")));
const { ids } = cardMaps(payload.data);
const pairs = [
  ["cardinfo-cache.json", "cardinfo-cache.js"],
  ["master-duel-locales.json", "master-duel-locales-cache.js"],
  ["master-duel-search-index.json", "master-duel-search-index.js"],
  ["multilang-aliases.json", "multilang-aliases.js"],
  ["multilang-search-index.json", "multilang-search-index.js"],
  ["pack-index.json", "pack-index-cache.js"],
  ["trend-catalog.json", "trend-catalog.js"],
];
for (const [json, js] of pairs) assert.deepEqual(await readWindowCache(path.join(DATA_DIR, js)), await readJson(path.join(DATA_DIR, json)), `${json} differs from its offline bundle`);
const limits = await readWindowCache(path.join(DATA_DIR, "limit-regulations-cache.js"));
for (const format of ["md", "ocg", "tcg"]) {
  const regulation = await readJson(path.join(DATA_DIR, "limit-regulations", `${format}.json`));
  assert.deepEqual(limits.formats[format], regulation);
  assert.match(regulation.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(regulation.date <= new Date().toISOString().slice(0, 10), "future banlist applied prematurely");
  assert.ok(Object.keys(regulation.regulation).length >= 100);
  assert.ok(Object.values(regulation.regulation).every((value) => [0, 1, 2, 3].includes(value)));
  if (format !== "md") assert.match(regulation.source, /KONAMI/, "paper formats must use the official current banlist");
}
const meta = await readWindowCache(path.join(DATA_DIR, "meta-samples.js"));
const decks = await readWindowCache(path.join(DATA_DIR, "deck-search-cache.js"));
let count = 0;
for (const [samples, anchor] of [[meta.samples, meta.generatedAt], ...decks.entries.map((entry) => [entry.samples, entry.cachedAt || entry.generatedAt])]) {
  for (const sample of samples) {
    assert.ok(sanitizeSample(sample, ids, anchor), `incomplete or unresolved sample: ${sample.url || sample.id}`);
    assert.ok(!("ageDays" in sample), "saved sample ages must not freeze freshness");
    if (sample.date) assert.ok(Number.isFinite(Date.parse(sample.date)), "sample date must be absolute");
    count += 1;
  }
}
assert.ok(count > 0, "sample caches must not be empty");
const power = await readWindowCache(path.join(DATA_DIR, "power-rankings-cache.js"));
for (const format of ["md", "ocg", "tcg"]) assert.ok(power.formats[format]?.groups?.some((group) => group.items.length), `${format} power ranking cache is empty`);
console.log(`data integrity checks passed: ${payload.data.length} cards, ${count} complete samples, official banlists, consistent offline bundles`);
