import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const CARD_CACHE_FILE = path.join(ROOT, "data", "cardinfo-cache.json");
const OUTPUT_FILE = path.join(ROOT, "data", "master-duel-locales.json");
const SEARCH_OUTPUT_FILE = path.join(ROOT, "data", "master-duel-search-index.json");
const SOURCE_URL = "https://dawnbrandbots.github.io/yaml-yugi/master-duel-raw.json";

const MD_ARCHETYPE_ZH_CN = {
  "Kewl Tune": "杀手旋律",
  Dracotail: "星宿",
  Enneacraft: "纠罪巧",
  "Radiant Typhoon": "绚岚",
  Elfnote: "耀圣",
  "Power Patron": "狱神",
  Memento: "冥铭途",
  DoomZ: "终刻",
  Yummy: "黯蜜",
  Maliss: "码丽丝",
  Mitsurugi: "巳剑",
  "Blue-Eyes": "青眼",
  "Dark Magician": "黑魔导",
  "Sky Striker": "闪刀姬",
  Branded: "烙印",
  Despia: "死狱乡",
  Tearlaments: "泪冠哀歌",
  Kashtira: "怒刹帝利",
  Labrynth: "白银城",
  Swordsoul: "相剑",
  "Snake-Eye": "蛇眼",
  "White Forest": "白森林",
  Toon: "卡通",
  Lunalight: "月光",
  "Light and Darkness Ritual": "光暗仪式",
  "Chaos Ritual": "混沌仪式",
  Witchcrafter: "魔女术",
  Unchained: "破械",
  Zoodiac: "十二兽",
};

const MD_ARCHETYPE_ZH_TW = {
  "Kewl Tune": "殺手旋律",
  Dracotail: "星宿",
  Enneacraft: "糾罪巧",
  "Radiant Typhoon": "絢嵐",
  Elfnote: "耀聖",
  "Power Patron": "獄神",
  Memento: "冥銘途",
  DoomZ: "終刻",
  Yummy: "黯蜜",
  Maliss: "碼麗絲",
  Mitsurugi: "巳劍",
  "Blue-Eyes": "青眼",
  "Dark Magician": "黑魔導",
  "Sky Striker": "閃刀姬",
  Branded: "烙印",
  Despia: "死獄鄉",
  Tearlaments: "淚冠哀歌",
  Kashtira: "怒剎帝利",
  Labrynth: "白銀城",
  Swordsoul: "相劍",
  "Snake-Eye": "蛇眼",
  "White Forest": "白森林",
  Toon: "卡通",
  Lunalight: "月光",
  "Light and Darkness Ritual": "光暗儀式",
  "Chaos Ritual": "混沌儀式",
  Witchcrafter: "魔女術",
  Unchained: "破械",
  Zoodiac: "十二獸",
};

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/[‐‑‒–—―－]/g, "-")
    .replace(/[・]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function coerceRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return Object.values(payload || {}).filter((row) => row && typeof row === "object");
}

function buildCardNameIndex(cards) {
  const index = new Map();
  for (const card of cards || []) {
    const key = normalizeName(card.name);
    if (key && !index.has(key)) index.set(key, card);
  }
  return index;
}

function compactCardLocale(row) {
  const locale = {};
  if (row.sc_name || row.sc_text) {
    locale["zh-CN"] = {
      name: row.sc_name || "",
      desc: row.sc_text || "",
    };
  }
  if (row.tc_name || row.tc_text) {
    locale["zh-TW"] = {
      name: row.tc_name || "",
      desc: row.tc_text || "",
    };
  }
  if (row.jp_name || row.ja_name || row.ja_text) {
    locale["ja-JP"] = {
      name: row.jp_name || row.ja_name || "",
      desc: row.ja_text || "",
    };
  }
  if (row.rarity) locale.rarity = row.rarity;
  if (row.releases) locale.releases = row.releases;
  if (row.obtain) locale.obtain = row.obtain;
  if (row.pack) locale.pack = row.pack;
  return locale;
}

function buildSearchNames(row) {
  return [
    ["md-zh-CN", row.sc_name],
    ["md-zh-TW", row.tc_name],
    ["md-ja-JP", row.jp_name || row.ja_name],
    ["md-en", row.en_name],
  ]
    .filter(([, name]) => typeof name === "string" && name.trim())
    .map(([lang, name]) => ({ lang, name }));
}

async function main() {
  const cardCache = JSON.parse(await fs.readFile(CARD_CACHE_FILE, "utf8"));
  const cards = cardCache.data || [];
  const cardsByName = buildCardNameIndex(cards);

  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${SOURCE_URL}: ${response.status}`);
  }
  const rawPayload = await response.json();
  const rows = coerceRows(rawPayload);
  const cardsById = {};
  const cardNamesById = {};
  const searchEntries = [];
  const misses = [];
  let matched = 0;

  for (const row of rows) {
    const englishName = row.en_name || row.name || row.card_name;
    const card = cardsByName.get(normalizeName(englishName));
    if (!card) {
      if (englishName) misses.push(englishName);
      continue;
    }

    matched += 1;
    const id = String(card.id);
    cardsById[id] = compactCardLocale(row);
    cardNamesById[id] = {};
    if (row.sc_name) cardNamesById[id]["zh-CN"] = { name: row.sc_name };
    if (row.tc_name) cardNamesById[id]["zh-TW"] = { name: row.tc_name };
    const names = buildSearchNames(row);
    if (names.length) searchEntries.push({ id: Number(card.id), names });
  }

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: "DawnbrandBots yaml-yugi Master Duel raw card data",
    sourceUrl: SOURCE_URL,
    stats: {
      sourceRows: rows.length,
      matched,
      uniqueCards: Object.keys(cardsById).length,
      misses: misses.slice(0, 200),
    },
    cards: cardsById,
    searchEntries,
    archetypes: {
      "zh-CN": MD_ARCHETYPE_ZH_CN,
      "zh-TW": MD_ARCHETYPE_ZH_TW,
    },
  };

  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(payload)}\n`);
  await fs.writeFile(SEARCH_OUTPUT_FILE, `${JSON.stringify({
    version: payload.version,
    generatedAt: payload.generatedAt,
    source: payload.source,
    sourceUrl: payload.sourceUrl,
    stats: payload.stats,
    cards: cardNamesById,
    searchEntries,
    archetypes: payload.archetypes,
  })}\n`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_FILE)}`);
  console.log(`Wrote ${path.relative(ROOT, SEARCH_OUTPUT_FILE)}`);
  console.log(JSON.stringify(payload.stats, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
