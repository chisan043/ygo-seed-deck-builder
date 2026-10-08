import path from "node:path";
import { fileURLToPath } from "node:url";
import { DATA_DIR, fetchData, readJson, writeJson } from "./data-utils.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT_FILE = path.join(DATA_DIR, "pack-index.json");
const YGOJSON_BASE = "https://raw.githubusercontent.com/iconmaster5326/YGOJSON/v1/aggregate";
const VALID_FORMATS = new Set(["tcg", "ocg", "masterduel"]);
const FORMAT_KEY = { tcg: "tcg", ocg: "ocg", masterduel: "md" };
const FORMAT_LOCALE_ORDER = {
  tcg: ["en", "na", "eu"],
  ocg: ["jp", "ja", "cn", "sc", "zh-CN", "kr"],
  masterduel: ["en", "jp", "ja", "zh-CN"],
};

async function main() {
  const [sets, cards] = await Promise.all([
    fetchJson(`${YGOJSON_BASE}/sets.json`),
    fetchJson(`${YGOJSON_BASE}/cards.json`),
  ]);

  const uuidToPassword = new Map();
  for (const card of cards || []) {
    const password = Number(card.passwords?.[0]);
    if (card.id && password) uuidToPassword.set(card.id, password);
  }

  const index = {};
  for (const set of sets || []) {
    for (const content of set.contents || []) {
      const formats = (content.formats || []).filter((format) => VALID_FORMATS.has(format));
      if (!formats.length) continue;

      for (const format of formats) {
        const formatKey = FORMAT_KEY[format];
        const localeKey = pickLocale(set, content, format);
        const locale = localeKey ? set.locales?.[localeKey] || {} : {};
        const rowBase = {
          name: localizeSetName(set.name || {}),
          date: locale.date || content.date || set.date || "",
        };
        const codePrefix = locale.prefix || content.prefix || "";

        for (const item of content.cards || []) {
          const cardId = uuidToPassword.get(item.card);
          if (!cardId) continue;

          const row = {
            ...rowBase,
            code: cardCode(codePrefix, item.suffix || item.code || ""),
            rarity: normalizeRarity(item.rarity || ""),
          };
          addPackRow(index, cardId, formatKey, row);
        }
      }
    }
  }

  // Supplement the historical multilingual index with current TCG printings.
  // A stalled aggregate source must not hide newly released English sets.
  const currentCards = (await readJson(path.join(DATA_DIR, "cardinfo-cache.json"))).data;
  const currentSets = await fetchData("https://db.ygoprodeck.com/api/v7/cardsets.php");
  if (!Array.isArray(currentSets) || currentSets.length < 100) throw new Error("current card-set source is incomplete");
  const setDates = new Map(currentSets.map((set) => [set.set_name, set.tcg_date || ""]));
  for (const card of currentCards) {
    for (const set of card.card_sets || []) {
      addPackRow(index, card.id, "tcg", {
        name: { en: set.set_name, ja: set.set_name, zh: set.set_name },
        date: setDates.get(set.set_name) || "",
        code: set.set_code || "",
        rarity: set.set_rarity || "",
      });
    }
  }

  for (const byFormat of Object.values(index)) {
    for (const format of Object.keys(byFormat)) {
      byFormat[format] = dedupeRows(byFormat[format])
        .sort(compareRows)
        .slice(0, 24);
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: "YGOJSON v1 aggregate + YGOPRODeck current TCG card sets",
    cards: index,
  };

  const previous = await readJson(OUT_FILE).catch(() => null);
  if (Object.keys(index).length < Math.max(10000, Object.keys(previous?.cards || {}).length * 0.9)) throw new Error("pack source is unexpectedly incomplete");
  await writeJson(OUT_FILE, payload);
  console.log(`wrote ${path.relative(ROOT, OUT_FILE)} (${Object.keys(index).length} cards)`);
}

async function fetchJson(url) {
  try {
    return await fetchData(url, { timeoutMs: 120000, attempts: 2 });
  } catch {
    // Some networks cannot reach raw.githubusercontent.com; the Git blob API
    // serves the same file without relying on that domain.
    const name = path.basename(new URL(url).pathname);
    const metadata = await fetchData(`https://api.github.com/repos/iconmaster5326/YGOJSON/contents/${name}?ref=v1%2Faggregate`);
    const blob = metadata.content ? metadata : await fetchData(metadata.git_url, { timeoutMs: 180000 });
    if (blob.encoding !== "base64" || !blob.content) throw new Error(`pack source ${name} has no readable content`);
    return JSON.parse(Buffer.from(blob.content, "base64").toString("utf8"));
  }
}

function pickLocale(set, content, format) {
  const available = new Set([
    ...(content.locales || []),
    ...Object.keys(set.locales || {}),
  ]);
  for (const locale of FORMAT_LOCALE_ORDER[format] || []) {
    if (available.has(locale)) return locale;
  }
  return content.locales?.[0] || Object.keys(set.locales || {})[0] || "";
}

function localizeSetName(name) {
  return {
    en: name.en || name["en-US"] || name.ja || name["zh-CN"] || "",
    ja: name.ja || name.en || name["zh-CN"] || "",
    zh: name["zh-CN"] || name["zh-TW"] || name.ja || name.en || "",
  };
}

function cardCode(prefix, suffix) {
  const cleanPrefix = String(prefix || "").trim();
  const cleanSuffix = String(suffix || "").trim();
  if (!cleanPrefix) return cleanSuffix;
  if (!cleanSuffix) return cleanPrefix;
  if (cleanSuffix.startsWith(cleanPrefix)) return cleanSuffix;
  return `${cleanPrefix}${cleanSuffix}`;
}

function normalizeRarity(value) {
  const raw = String(value || "").toLowerCase().replace(/[\s_-]+/g, "");
  const labels = {
    common: "Common",
    rare: "Rare",
    super: "Super",
    ultra: "Ultra",
    secret: "Secret",
    prismaticsecret: "Prismatic Secret",
    platinumsecret: "Platinum Secret",
    quartercenturysecret: "Quarter Century Secret",
    collectors: "Collector's",
    collectorsrare: "Collector's Rare",
    starlight: "Starlight",
    starlightrare: "Starlight Rare",
    ultimate: "Ultimate",
    ghost: "Ghost",
    gold: "Gold",
    parallel: "Parallel",
    normalparallel: "Normal Parallel",
    "25thsecret": "25th Secret",
  };
  return labels[raw] || String(value || "")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function addPackRow(index, cardId, format, row) {
  index[cardId] ||= {};
  index[cardId][format] ||= [];
  index[cardId][format].push(row);
}

function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = [
      row.name.en,
      row.name.ja,
      row.name.zh,
      row.code,
      row.rarity,
      row.date,
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compareRows(a, b) {
  const aDate = Date.parse(a.date || "");
  const bDate = Date.parse(b.date || "");
  if (Number.isFinite(aDate) && Number.isFinite(bDate) && bDate !== aDate) return bDate - aDate;
  if (Number.isFinite(aDate) && !Number.isFinite(bDate)) return -1;
  if (!Number.isFinite(aDate) && Number.isFinite(bDate)) return 1;
  return (a.name.en || "").localeCompare(b.name.en || "");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
