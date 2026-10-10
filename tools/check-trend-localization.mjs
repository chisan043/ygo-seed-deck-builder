import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import crypto from "node:crypto";
import os from "node:os";
import { spawnSync } from "node:child_process";
import support from "../trend-support.js";
import { activeTrendNames, buildTrendCatalog, isImage } from "./trend-catalog.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");

function functionBody(name) {
  const match = source.match(new RegExp(`(?:async )?function ${name}[^\\n]*\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `${name} should exist in app.js`);
  return match[1];
}

const inferred = functionBody("buildInferredArchetypeLocales");
assert.ok(
  inferred.includes('locale["ja-JP"]?.name') && inferred.includes('storedLocale["ja-JP"]?.name'),
  "archetype inference should use Japanese official card names",
);
assert.ok(
  inferred.includes("return { zh, ja };"),
  "archetype inference should produce both Chinese and Japanese labels",
);

const ensureTrendLocales = functionBody("ensureTrendLocaleData");
assert.ok(
  ensureTrendLocales.includes("JSON.stringify(state.inferredArchetypeLocales || {})"),
  "trend localization should rerender when Chinese or Japanese inferred labels change",
);

for (const [language, names] of Object.entries({
  zh: ["Darklord", "Ancient Gear", "HERO"],
  ja: ["Darklord", "Ancient Gear", "HERO", "HEROs"],
})) {
  for (const name of names) {
    assert.ok(support.names[language][name], `${language} trend map should include ${name}`);
  }
}

const readBundle = name => JSON.parse(fs.readFileSync(path.join(root, "data", name), "utf8").replace(/^window\.\w+\s*=\s*/, "").replace(/;\s*$/, ""));
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data/trend-catalog.json"), "utf8"));
assert.deepEqual(readBundle("trend-catalog.js"), catalog);
const names = activeTrendNames(readBundle("deck-search-cache.js"), readBundle("power-rankings-cache.js"));
for (const name of names) {
  const entry = support.entryFor(name, catalog);
  for (const language of ["zh", "ja"]) {
    assert.ok(entry?.labels[language], `${language} name missing: ${name}`);
    assert.ok(!support.hasUntranslatedText(entry.labels[language]), `English leaked into ${language} label: ${name}`);
  }
  assert.match(entry.image, /^data\/trend-images\/\d+\.jpg$/);
  const buffer = fs.readFileSync(path.join(root, entry.image));
  assert.ok(isImage(buffer), `Artwork missing/corrupt: ${name}`);
  assert.equal(crypto.createHash("sha256").update(buffer).digest("hex"), entry.imageHash);
}
assert.equal(support.labelFor("CLOWN-CREW", "zh", catalog), "小丑戏帮");
assert.equal(support.labelFor("Resonators", "zh", catalog), "共鸣者");
assert.equal(support.labelFor("Resonator", "zh", catalog), "共鸣者");
assert.equal(support.labelFor("Clown Crew + Resonators", "zh", catalog), "小丑戏帮共鸣者");
assert.equal(support.labelFor("Clown Crew", "en", catalog), "Clown Crew");
assert.equal(support.labelFor("Maliss", "zh", catalog), "码丽丝", "real names ending in s must remain intact");
assert.equal(support.labelFor("Clown Crew", "ja", catalog), "道化の一座");
assert.equal(support.labelFor("Resonators", "ja", catalog), "リゾネーター");
assert.equal(support.labelFor("Resonator", "ja", catalog), "リゾネーター");
assert.equal(support.labelFor("Clown Crew + Resonators", "ja", catalog), "道化の一座 リゾネーター");
assert.equal(support.labelFor("杀手级调整曲", "ja", catalog), "キラーチューン", "localized source aliases must switch language too");
assert.equal(support.hasUntranslatedText("Ｍ∀ＬＩＣＥ"), false, "official Latin-script Japanese names are intentional");
assert.equal(support.hasUntranslatedText("Clown Crew"), true);
assert.equal(support.inferLabel(["バリア・リゾネーター", "チェーン・リゾネーター", "クロック・リゾネーター"], "ja"), "リゾネーター", "the Japanese long-vowel marker must be retained");
assert.equal(support.inferLabel(["道化の一座 ホワイトフェイス", "道化の一座 ディアボロ", "道化の一座 フレア"], "ja"), "道化の一座", "Hiragana inside a series name is significant");
assert.equal(support.labelFor("Clown Crew Resonators", "ja", { entries: {
  ...catalog.entries, clowncrewresonators: { name: "Clown Crew Resonators", labels: { zh: "小丑戏帮共鸣者" } },
} }), "道化の一座 リゾネーター", "an untranslated compound entry must not hide its translated components");

// A future series is resolved from distinct official card names without a code edit.
const family = [1, 2, 3, 4].map(id => ({ id, name: `New Crew ${id}`, archetype: "New Crew", type: "Effect Monster", card_images: [{ id, image_url_cropped: `https://example.com/${id}.jpg` }] }));
const fixture = {
  cards: family, aliases: { entries: [] }, power: { formats: {} },
  decks: { entries: [{ descriptor: { type: "archetype", name: "New Crews" }, samples: [{ mainIds: [1, 2, 3, 4], extraIds: [] }] }] },
  locales: { cards: Object.fromEntries(family.map(card => [card.id, { "zh-CN": { name: `新星戏团 ${card.id}` }, "ja-JP": { name: `星の一座 ${["旅人", "守人", "奏者", "探検家"][card.id - 1]}` } }])) },
};
const generated = await buildTrendCatalog(fixture);
assert.equal(support.labelFor("New Crews", "zh", generated), "新星戏团");
assert.equal(support.labelFor("New Crews", "ja", generated), "星の一座");
assert.ok(support.entryFor("New Crews", generated).image);
await assert.rejects(() => buildTrendCatalog({ ...fixture, locales: { cards: {} } }), /Unresolved Chinese/,
  "unverified updates must not publish an English name or overwrite a good catalog");
const onlyChinese = { cards: Object.fromEntries(family.map(card => [card.id, { "zh-CN": fixture.locales.cards[card.id]["zh-CN"] }])) };
await assert.rejects(() => buildTrendCatalog({ ...fixture, locales: onlyChinese }), /Unresolved Japanese/,
  "missing Japanese translations must also block publication");
const fetched = await buildTrendCatalog({ ...fixture, locales: onlyChinese, officialLocale: async (id, locale) => {
  assert.equal(locale, "ja");
  return { texts: { "ja-JP": { name: `星の一座 カード${id}`, official: true } } };
} });
assert.ok(support.labelFor("New Crews", "ja", fetched));
assert.ok(fetched.officialCards[1]["ja-JP"].official);
assert.equal(isImage(Buffer.from("<html>image server error</html>")), false);

// Test a failed download against the actual publisher in an isolated data directory.
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "ygo-trend-test-"));
try {
  const files = {
    "cardinfo-cache.json": { data: family }, "master-duel-locales.json": fixture.locales,
    "multilang-aliases.json": fixture.aliases,
  };
  for (const [name, payload] of Object.entries(files)) fs.writeFileSync(path.join(temporary, name), JSON.stringify(payload));
  fs.writeFileSync(path.join(temporary, "deck-search-cache.js"), `window.YGO_DECK_SEARCH_CACHE = ${JSON.stringify(fixture.decks)};`);
  fs.writeFileSync(path.join(temporary, "power-rankings-cache.js"), `window.YGO_POWER_RANKINGS_CACHE = ${JSON.stringify(fixture.power)};`);
  const previousJson = '{"version":1,"previousVerified":true}';
  const previousJs = `window.YGO_TREND_CATALOG = ${previousJson};`;
  fs.writeFileSync(path.join(temporary, "trend-catalog.json"), previousJson);
  fs.writeFileSync(path.join(temporary, "trend-catalog.js"), previousJs);
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import { syncTrendCatalog } from ${JSON.stringify(new URL("./trend-catalog.mjs", import.meta.url).href)};
    globalThis.fetch = async () => new Response('<html>' + 'x'.repeat(2000) + '</html>');
    await assert.rejects(() => syncTrendCatalog(), /invalid image response/);
  `], { env: { ...process.env, YGO_DATA_DIR: temporary }, encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(fs.readFileSync(path.join(temporary, "trend-catalog.json"), "utf8"), previousJson);
  assert.equal(fs.readFileSync(path.join(temporary, "trend-catalog.js"), "utf8"), previousJs);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }

// Exercise the real frontend before the lazy card DB or locale index has loaded.
const context = {
  window: { YGO_TREND_CATALOG: catalog }, YGOTrendSupport: support,
  state: { language: "zh", activeFormat: "md", allCards: [], cardByAnyId: new Map(), inferredArchetypeLocales: {}, untranslatedDeckNames: new Set() },
  TREND_REPRESENTATIVE_CARD_IDS: support.representativeIds, OFFLINE_SCRIPT_VERSION: "test",
  trendNameMaps: support.names, deckSearchCoreIds: { Eldlich: 95440946 }, fieldMaps: {}, CAN_USE_LOCAL_API: false,
  normalize: support.key, compactSpaces: value => String(value || "").replace(/\s+/g, " ").trim(), console,
};
vm.createContext(context);
for (const name of ["localizeTrendName", "localizeArchetype", "flagUntranslatedDeckName", "hasLatinDeckText", "localizeCompoundDeckName", "localizedDeckComponentEntries", "findTrendRepresentativeCard", "trendRepresentativeImage", "localCardImageUrl", "handleTrendImageError"]) {
  const code = source.match(new RegExp(`(?:async )?function ${name}[^\\n]*\\{[\\s\\S]*?\\n\\}`));
  vm.runInContext(code[0], context);
}
for (const language of ["zh", "ja"]) {
  context.state.language = language;
  for (const name of names) {
    assert.equal(context.localizeTrendName(name), support.labelFor(name, language, catalog));
    assert.match(context.trendRepresentativeImage(name), /^data\/trend-images\//);
  }
  assert.equal(context.localizeTrendName("Uncatalogued Future Series"), language === "ja" ? "名称の翻訳準備中" : "译名待收录");
}
let replacements = 0;
const broken = { matches: () => true, dataset: {}, tagName: "image", setAttribute: (name, value) => { assert.equal(name, "href"); assert.equal(value, "assets/trend-card-back.svg"); replacements++; } };
context.handleTrendImageError({ target: broken });
context.handleTrendImageError({ target: broken });
assert.equal(replacements, 1, "SVG failures must replace blank wedges without a retry loop");

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(html.indexOf('src="data/trend-catalog.js') < html.indexOf('src="app.js'), "catalog must load before the first render");
console.log(`trend localization and offline artwork checks passed: ${names.length} active names across MD/OCG/TCG`);
