import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DATA_DIR = path.resolve(process.env.YGO_DATA_DIR || path.join(ROOT, "data"));

export async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

export async function readWindowCache(file) {
  return JSON.parse((await fs.readFile(file, "utf8")).replace(/^window\.\w+\s*=\s*/, "").replace(/;\s*$/, ""));
}

export async function atomicWrite(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await fs.writeFile(temporary, text, "utf8");
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export function writeJson(file, payload, spaces = 0) {
  return atomicWrite(file, `${JSON.stringify(payload, null, spaces || undefined)}\n`);
}

export function writeWindowCache(file, globalName, payload) {
  return atomicWrite(file, `window.${globalName} = ${JSON.stringify(payload)};\n`);
}

export async function fetchData(url, { json = true, timeoutMs = 60000, attempts = 3 } = {}) {
  let error;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 Yu-Gi-Oh Seed Deck Builder data sync" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return json ? await response.json() : await response.text();
    } catch (cause) {
      error = cause;
    }
  }
  throw error;
}

export function cleanText(value) {
  return String(value || "").replace(/<[^>]*>/g, " ")
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex, number) => String.fromCodePoint(parseInt(hex || number, hex ? 16 : 10)))
    .replaceAll("&nbsp;", " ").replaceAll("&amp;", "&").replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">")
    .replace(/\s+/g, " ").trim();
}

export function cardNameKey(value) {
  return cleanText(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[Ωω]/g, "omega").replace(/[βΒ]/g, "beta").replace(/[üÜ]/g, "u")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function cardMaps(cards) {
  const ids = new Map();
  const names = new Map();
  for (const card of cards || []) {
    const id = Number(card.id);
    ids.set(id, id);
    names.set(cardNameKey(card.name), card);
    for (const image of card.card_images || []) if (image.id) ids.set(Number(image.id), id);
    for (const info of card.misc_info || []) {
      if (info.beta_id) ids.set(Number(info.beta_id), id);
    }
  }
  return { ids, names };
}

export function absoluteSampleDate(value, anchor = new Date().toISOString()) {
  const text = String(value || "").trim();
  const relative = text.match(/^(\d+)\s+(day|week|month|year)s?\s+ago$/i);
  let time;
  if (relative) {
    const days = { day: 1, week: 7, month: 30, year: 365 }[relative[2].toLowerCase()];
    time = Date.parse(anchor) - Number(relative[1]) * days * 86400000;
  } else {
    const cleaned = text.replace(/(\d{1,2})(st|nd|rd|th)/gi, "$1");
    time = Date.parse(/^[A-Za-z]+\s+\d{1,2},?\s+\d{4}$/.test(cleaned) ? `${cleaned} UTC` : cleaned);
  }
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

export function sanitizeSample(sample, ids, anchor) {
  if (!sample || !Array.isArray(sample.mainIds)) return null;
  const sections = {};
  for (const section of ["mainIds", "extraIds", "sideIds"]) {
    const raw = sample[section] || [];
    if (!Array.isArray(raw) || raw.some((id) => !ids.has(Number(id)))) return null;
    sections[section] = raw.map((id) => ids.get(Number(id)));
  }
  if (sections.mainIds.length < 40 || sections.mainIds.length > 60 || sections.extraIds.length > 15 || sections.sideIds.length > 15) return null;
  const { ageDays, ...rest } = sample;
  return { ...rest, ...sections, date: absoluteSampleDate(sample.date || sample.created || sample.updated, sample.fetchedAt || anchor) };
}

export function validateCardPayload(payload, previousCount = 0) {
  const cards = payload?.data;
  if (!Array.isArray(cards) || cards.length < Math.max(10000, previousCount * 0.9)) throw new Error("card database is empty or unexpectedly incomplete");
  if (new Set(cards.map((card) => card.id)).size !== cards.length || cards.some((card) => !card.id || !card.name || !card.desc)) throw new Error("invalid or duplicate cards in database");
  return payload;
}

export async function syncOfflineBundles() {
  const pairs = [
    ["cardinfo-cache.json", "cardinfo-cache.js", "YGO_CARDINFO_CACHE"],
    ["master-duel-locales.json", "master-duel-locales-cache.js", "YGO_MASTER_DUEL_LOCALES"],
    ["master-duel-search-index.json", "master-duel-search-index.js", "YGO_MASTER_DUEL_SEARCH_INDEX"],
    ["multilang-aliases.json", "multilang-aliases.js", "YGO_MULTILANG_ALIASES"],
    ["multilang-search-index.json", "multilang-search-index.js", "YGO_MULTILANG_SEARCH_INDEX"],
    ["pack-index.json", "pack-index-cache.js", "YGO_PACK_INDEX"],
  ];
  for (const [json, js, globalName] of pairs) await writeWindowCache(path.join(DATA_DIR, js), globalName, await readJson(path.join(DATA_DIR, json)));
  const formats = {};
  for (const format of ["md", "ocg", "tcg"]) formats[format] = await readJson(path.join(DATA_DIR, "limit-regulations", `${format}.json`));
  await writeWindowCache(path.join(DATA_DIR, "limit-regulations-cache.js"), "YGO_LIMIT_REGULATIONS", { version: 1, generatedAt: new Date().toISOString(), formats });
}

export async function seedDataDirectory() {
  const source = path.join(ROOT, "data");
  if (DATA_DIR === source) return;
  await fs.mkdir(DATA_DIR, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (entry.isFile() && /\.(json|js)$/.test(entry.name) && entry.name !== "resource-cache-ready.json") {
      await fs.copyFile(path.join(source, entry.name), path.join(DATA_DIR, entry.name), fs.constants.COPYFILE_EXCL).catch((error) => { if (error.code !== "EEXIST") throw error; });
    }
  }
  await fs.cp(path.join(source, "limit-regulations"), path.join(DATA_DIR, "limit-regulations"), { recursive: true, force: false });
  await fs.cp(path.join(source, "trend-images"), path.join(DATA_DIR, "trend-images"), { recursive: true, force: false, errorOnExist: false });
}
