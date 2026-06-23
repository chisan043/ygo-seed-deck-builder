import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const OUT_FILE = path.join(ROOT, "data", "pack-index.json");
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

  for (const byFormat of Object.values(index)) {
    for (const format of Object.keys(byFormat)) {
      byFormat[format] = dedupeRows(byFormat[format])
        .sort(compareRows)
        .slice(0, 24);
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: "YGOJSON v1 aggregate sets/cards",
    cards: index,
  };

  await fs.writeFile(OUT_FILE, `${JSON.stringify(payload)}\n`);
  console.log(`wrote ${path.relative(ROOT, OUT_FILE)} (${Object.keys(index).length} cards)`);
}

async function fetchJson(url) {
  const tempPath = path.join(ROOT, "data", `.pack-sync-${path.basename(url)}-${Date.now()}.tmp`);
  await execFileAsync("curl", [
    "-L",
    "--fail",
    "--retry",
    "3",
    "--retry-delay",
    "2",
    "--max-time",
    "120",
    "-s",
    "-o",
    tempPath,
    url,
  ], { maxBuffer: 1024 * 1024 });
  try {
    return JSON.parse(await fs.readFile(tempPath, "utf8"));
  } finally {
    await fs.rm(tempPath, { force: true });
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
