import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import zlib from "node:zlib";
import { promisify } from "node:util";
import crypto from "node:crypto";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const META_FILE = path.join(ROOT, "data", "meta-samples.js");
const CARD_CACHE_FILE = path.join(ROOT, "data", "cardinfo-cache.json");
const ALIAS_FILE = path.join(ROOT, "data", "multilang-aliases.json");
const MASTER_DUEL_LOCALE_FILE = path.join(ROOT, "data", "master-duel-locales.json");
const PACK_INDEX_FILE = path.join(ROOT, "data", "pack-index.json");
const OFFICIAL_LOCALE_CACHE_DIR = path.join(ROOT, "data", "official-locale-cache");
const LIMIT_REGULATION_DIR = path.join(ROOT, "data", "limit-regulations");
const DECK_SEARCH_CACHE_DIR = path.join(ROOT, "data", "deck-search-cache");
const SYNC_SCRIPT = path.join(ROOT, "tools", "sync-ygoprodeck-samples.mjs");
const CARD_DB_URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php?misc=yes";
const LIMIT_REGULATION_URLS = {
  tcg: "https://dawnbrandbots.github.io/yaml-yugi-limit-regulation/tcg/current.vector.json",
  ocg: "https://dawnbrandbots.github.io/yaml-yugi-limit-regulation/ocg/current.vector.json",
  md: "https://dawnbrandbots.github.io/yaml-yugi-limit-regulation/master-duel/current.vector.json",
};
const HOST = "127.0.0.1";
const START_PORT = Number(process.env.PORT || 5173);
const REFRESH_MS = Number(process.env.META_REFRESH_MS || 6 * 60 * 60 * 1000);
const CARD_CACHE_MS = Number(process.env.CARD_CACHE_MS || 24 * 60 * 60 * 1000);
const OFFICIAL_LOCALE_CACHE_MS = Number(process.env.OFFICIAL_LOCALE_CACHE_MS || 90 * 24 * 60 * 60 * 1000);
const LIMIT_REGULATION_REFRESH_MS = Number(process.env.LIMIT_REGULATION_REFRESH_MS || 24 * 60 * 60 * 1000);
const DECK_SEARCH_CACHE_MS = Number(process.env.DECK_SEARCH_CACHE_MS || 30 * 60 * 1000);
const POWER_RANKING_CACHE_MS = Number(process.env.POWER_RANKING_CACHE_MS || 30 * 60 * 1000);
const DECK_SEARCH_CACHE_VERSION = "20260622-deck-instance-labels";
const CACHE_NO_STORE = "no-store";
const CACHE_REVALIDATE = "no-cache";
const CACHE_SHORT = "public, max-age=600, stale-while-revalidate=3600";
const CACHE_MEDIUM = "public, max-age=3600, stale-while-revalidate=86400";
const CACHE_LONG = "public, max-age=86400, stale-while-revalidate=604800";
const DECK_SEARCH_ALIASES = {
  "黑魔导": "Dark Magician",
  "ブラックマジシャン": "Dark Magician",
  "ブラック・マジシャン": "Dark Magician",
  "青眼": "Blue-Eyes",
  "青眼白龙": "Blue-Eyes",
  "ブルーアイズ": "Blue-Eyes",
  "蓝眼": "Blue-Eyes",
  "闪刀": "Sky Striker",
  "闪刀姬": "Sky Striker",
  "閃刀姫": "Sky Striker",
  "烙印": "Branded",
  "杀手旋律": "Kewl Tune",
  "殺手旋律": "Kewl Tune",
  "キラーチューン": "Kewl Tune",
  "星宿": "Dracotail",
  "纠罪巧": "Enneacraft",
  "糾罪巧": "Enneacraft",
  "九艺": "Enneacraft",
  "绚岚": "Radiant Typhoon",
  "绚岚十二兽": "Radiant Typhoon Zoodiac",
  "絢嵐十二獸": "Radiant Typhoon Zoodiac",
  "十二兽": "Zoodiac",
  "十二獸": "Zoodiac",
  "耀圣": "Elfnote",
  "耀聖": "Elfnote",
  "狱神": "Power Patron",
  "獄神": "Power Patron",
  "冥铭途": "Memento",
  "冥銘途": "Memento",
  "终刻": "DoomZ",
  "黯蜜": "Yummy",
  "码丽丝": "Maliss",
  "碼麗絲": "Maliss",
};
const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};
const gzip = promisify(zlib.gzip);
const COMPRESSIBLE_EXTENSIONS = new Set([".html", ".js", ".css", ".json", ".svg"]);

let refreshState = {
  running: false,
  lastSuccessAt: null,
  lastError: null,
};
let cardIndexPromise = null;
let aliasDataPromise = null;
let masterDuelLocalePromise = null;
let packIndexPromise = null;
const metaDeckCache = new Map();
const trendCache = new Map();
const powerRankingCache = new Map();
const deckSearchResultCache = new Map();
const limitRegulationRefreshes = new Map();
const deckSearchRefreshes = new Map();
const META_DECK_CACHE_MS = 10 * 60 * 1000;

async function main() {
  const server = http.createServer(handleRequest);
  const port = await listenOnAvailablePort(server, START_PORT);
  console.log(`Yu-Gi-Oh! Seed Deck Builder: http://${HOST}:${port}`);
  console.log(`Meta samples refresh every ${Math.round(REFRESH_MS / 60000)} minutes.`);

  refreshSamples("startup");
  setInterval(() => refreshSamples("interval"), REFRESH_MS).unref();
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/refresh-meta") {
    await refreshSamples("manual");
    sendJson(res, refreshState);
    return;
  }

  if (url.pathname === "/api/meta-samples") {
    const payload = await readMetaPayload();
    sendJson(res, {
      ...payload,
      refreshState,
    }, { cacheControl: CACHE_SHORT });
    return;
  }

  if (url.pathname === "/api/cardinfo") {
    try {
      const { payload } = await getCardIndex();
      await sendJsonCompressed(req, res, payload, { cacheControl: CACHE_LONG });
    } catch (error) {
      res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  if (url.pathname === "/api/card-locales") {
    const ids = new Set(
      String(url.searchParams.get("ids") || "")
        .split(",")
        .map((id) => Number(id.trim()))
        .filter(Boolean),
    );
    const payload = await getAliasData().catch(() => ({ entries: [] }));
    await sendJsonCompressed(req, res, {
      entries: (payload.entries || []).filter((entry) => ids.has(Number(entry.id))),
    }, { cacheControl: CACHE_LONG });
    return;
  }

  if (url.pathname === "/api/official-card-locales") {
    const ids = [
      ...new Set(
        String(url.searchParams.get("ids") || "")
          .split(",")
          .map((id) => Number(id.trim()))
          .filter(Boolean),
      ),
    ];
    const locale = normalizeKonamiLocale(url.searchParams.get("locale"));
    if (!locale) {
      res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "unsupported locale" }));
      return;
    }
    const entries = await mapLimit(ids, 8, (id) => getOfficialCardLocale(id, locale));
    await sendJsonCompressed(req, res, {
      source: "KONAMI Yu-Gi-Oh! Neuron official card database",
      sourceUrl: "https://www.db.yugioh-card.com/yugiohdb/card_search.action",
      locale,
      entries: entries.filter(Boolean),
    }, { cacheControl: CACHE_MEDIUM });
    return;
  }

  if (url.pathname === "/api/master-duel-card-locales") {
    const ids = new Set(
      String(url.searchParams.get("ids") || "")
        .split(",")
        .map((id) => Number(id.trim()))
        .filter(Boolean),
    );
    const payload = await getMasterDuelLocaleData().catch(() => ({ cards: {} }));
    await sendJsonCompressed(req, res, {
      generatedAt: payload.generatedAt || "",
      source: payload.source || "",
      sourceUrl: payload.sourceUrl || "",
      entries: [...ids].map((id) => ({ id, texts: payload.cards?.[id] || {} })),
    }, { cacheControl: CACHE_LONG });
    return;
  }

  if (url.pathname === "/api/card-packs") {
    const ids = new Set(
      String(url.searchParams.get("ids") || "")
        .split(",")
        .map((id) => Number(id.trim()))
        .filter(Boolean),
    );
    try {
      const payload = await getPackIndex();
      await sendJsonCompressed(req, res, {
        generatedAt: payload.generatedAt || "",
        source: payload.source || "",
        entries: [...ids].map((id) => ({ id, packs: payload.cards?.[id] || {} })),
      }, { cacheControl: CACHE_MEDIUM });
    } catch (error) {
      await sendJsonCompressed(req, res, {
        generatedAt: "",
        source: "",
        entries: [...ids].map((id) => ({ id, packs: {} })),
        error: error.message,
      }, { cacheControl: CACHE_MEDIUM });
    }
    return;
  }

  if (url.pathname === "/api/limit-regulation") {
    const format = normalizeFormat(url.searchParams.get("format"));
    const forceRefresh = url.searchParams.get("refresh") === "1";
    try {
      const payload = await getCachedLimitRegulation(format, forceRefresh);
      sendJson(res, payload, { cacheControl: forceRefresh ? CACHE_NO_STORE : CACHE_MEDIUM });
    } catch (error) {
      console.warn(`limit regulation failed (${format}): ${error.message}`);
      sendJson(res, { format, date: "", regulation: null, source: "", cachedAt: "", stale: true, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/deck-search") {
    const cardId = Number(url.searchParams.get("cardId"));
    const cardName = url.searchParams.get("cardName") || "";
    const cardArchetype = url.searchParams.get("cardArchetype") || "";
    const format = normalizeFormat(url.searchParams.get("format"));
    const limit = Number(url.searchParams.get("limit") || 36);
    const forceRefresh = url.searchParams.get("refresh") === "1";
    if (!cardId) {
      res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "cardId is required" }));
      return;
    }
    try {
      const payload = await getCachedDeckSearch(
        { type: "card", cardId, cardName, cardArchetype, format, limit },
        () => searchDecksByCard(cardId, limit, format, cardName, cardArchetype, forceRefresh),
        { forceRefresh },
      );
      sendJson(res, { ...payload, cardId, format }, { cacheControl: forceRefresh ? CACHE_NO_STORE : CACHE_SHORT });
    } catch (error) {
      console.warn(`deck search failed: ${error.message}`);
      sendJson(res, { generatedAt: new Date().toISOString(), cardId, format, samples: [], error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/archetype-deck-search") {
    const requestedName = url.searchParams.get("name") || "";
    const name = resolveDeckSearchAlias(requestedName);
    const format = normalizeFormat(url.searchParams.get("format"));
    const limit = Number(url.searchParams.get("limit") || 36);
    const forceRefresh = url.searchParams.get("refresh") === "1";
    if (!requestedName.trim()) {
      res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "name is required" }));
      return;
    }
    if (isUnrecognizedCjkDeckQuery(requestedName, name)) {
      sendJson(res, {
        generatedAt: new Date().toISOString(),
        name: requestedName,
        resolvedName: name,
        format,
        samples: [],
      });
      return;
    }
    try {
      const payload = await getCachedDeckSearch(
        { type: "archetype", name, format, limit },
        () => searchDecksByArchetype(name, limit, format, forceRefresh),
        { forceRefresh },
      );
      sendJson(res, { ...payload, name: requestedName, resolvedName: name, format }, { cacheControl: forceRefresh ? CACHE_NO_STORE : CACHE_SHORT });
    } catch (error) {
      console.warn(`archetype deck search failed (${format}, ${requestedName} -> ${name}): ${error.message}`);
      sendJson(res, { generatedAt: new Date().toISOString(), name: requestedName, resolvedName: name, format, samples: [], error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/format-trends") {
    const format = normalizeFormat(url.searchParams.get("format"));
    const forceRefresh = url.searchParams.get("refresh") === "1";
    try {
      const trends = await buildFormatTrends(format, forceRefresh);
      sendJson(res, trends, { cacheControl: forceRefresh ? CACHE_NO_STORE : CACHE_SHORT });
    } catch (error) {
      console.warn(`format trends failed (${format}): ${error.message}`);
      sendJson(res, { format, generatedAt: new Date().toISOString(), items: [], sources: [], error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/power-rankings") {
    const format = normalizeFormat(url.searchParams.get("format"));
    const forceRefresh = url.searchParams.get("refresh") === "1";
    try {
      const rankings = await buildPowerRankings(format, forceRefresh);
      sendJson(res, rankings, { cacheControl: forceRefresh ? CACHE_NO_STORE : CACHE_SHORT });
    } catch (error) {
      console.warn(`power rankings failed (${format}): ${error.message}`);
      sendJson(res, { format, generatedAt: new Date().toISOString(), groups: [], source: "", error: error.message });
    }
    return;
  }

  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const safePath = path.normalize(path.join(ROOT, pathname));
  if (!safePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const rawBody = await fs.readFile(safePath);
    const ext = path.extname(safePath);
    const compressed = await maybeCompress(req, rawBody, ext);
    res.writeHead(200, {
      "content-type": STATIC_TYPES[ext] || "application/octet-stream",
      "cache-control": staticCacheControl(ext, url),
      ...compressed.headers,
    });
    res.end(compressed.body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

async function maybeCompress(req, body, ext) {
  const acceptsGzip = String(req.headers["accept-encoding"] || "").includes("gzip");
  if (!acceptsGzip || body.length < 1024 || !COMPRESSIBLE_EXTENSIONS.has(ext)) {
    return { body, headers: {} };
  }

  return {
    body: await gzip(body, { level: 6 }),
    headers: {
      "content-encoding": "gzip",
      vary: "accept-encoding",
    },
  };
}

async function refreshSamples(reason) {
  if (refreshState.running) return refreshState;
  refreshState = { ...refreshState, running: true, lastError: null };

  try {
    await runNodeScript(SYNC_SCRIPT);
    refreshState = {
      running: false,
      lastSuccessAt: new Date().toISOString(),
      lastError: null,
    };
    console.log(`meta samples refreshed (${reason})`);
  } catch (error) {
    refreshState = {
      ...refreshState,
      running: false,
      lastError: error.message,
    };
    console.warn(`meta sample refresh failed (${reason}): ${error.message}`);
  }

  return refreshState;
}

function runNodeScript(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
      process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`sync exited with code ${code}`));
    });
  });
}

async function readMetaPayload() {
  const text = await fs.readFile(META_FILE, "utf8");
  const json = text
    .replace(/^window\.YGO_META_SAMPLES\s*=\s*/, "")
    .replace(/;\s*$/, "");
  return JSON.parse(json);
}

function sendJson(res, payload, options = {}) {
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": options.cacheControl || CACHE_NO_STORE,
  });
  res.end(JSON.stringify(payload));
}

async function sendJsonCompressed(req, res, payload, options = {}) {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const compressed = await maybeCompress(req, rawBody, ".json");
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": options.cacheControl || CACHE_NO_STORE,
    ...compressed.headers,
  });
  res.end(compressed.body);
}

function staticCacheControl(ext, url) {
  if (ext === ".html") return CACHE_REVALIDATE;
  if (url.searchParams.size) return CACHE_LONG;
  if (ext === ".json" || ext === ".js" || ext === ".css" || ext === ".svg") return CACHE_MEDIUM;
  if ([".png", ".jpg", ".jpeg"].includes(ext)) return CACHE_LONG;
  return CACHE_REVALIDATE;
}

async function getText(url, timeoutMs = 20000) {
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 Codex local prototype deck trends" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

async function getJson(url, timeoutMs = 20000) {
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 Codex local prototype deck trends" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function getCachedLimitRegulation(format, forceRefresh = false) {
  const cacheFile = limitRegulationCacheFile(format);
  if (forceRefresh) return fetchAndCacheLimitRegulation(format, cacheFile);

  const cached = await readLimitRegulationCache(cacheFile).catch(() => null);

  if (cached?.regulation) {
    const age = Date.now() - Date.parse(cached.cachedAt || 0);
    const stale = !Number.isFinite(age) || age > LIMIT_REGULATION_REFRESH_MS;
    if (stale) refreshLimitRegulationInBackground(format, cacheFile);
    return { ...cached, format, stale };
  }

  return fetchAndCacheLimitRegulation(format, cacheFile);
}

function refreshLimitRegulationInBackground(format, cacheFile) {
  if (limitRegulationRefreshes.has(format)) return;
  const refresh = fetchAndCacheLimitRegulation(format, cacheFile)
    .catch((error) => console.warn(`limit regulation background refresh failed (${format}): ${error.message}`))
    .finally(() => limitRegulationRefreshes.delete(format));
  limitRegulationRefreshes.set(format, refresh);
}

async function fetchAndCacheLimitRegulation(format, cacheFile = limitRegulationCacheFile(format)) {
  const url = LIMIT_REGULATION_URLS[format];
  if (!url) throw new Error(`unknown format: ${format}`);
  const remote = await getJson(url, 15000);
  const payload = {
    format,
    date: remote.date || "",
    regulation: remote.regulation || {},
    source: "Dawnbrand current limit regulation",
    sourceUrl: url,
    cachedAt: new Date().toISOString(),
    stale: false,
  };
  await fs.mkdir(LIMIT_REGULATION_DIR, { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify(payload, null, 2));
  return payload;
}

async function readLimitRegulationCache(cacheFile) {
  return JSON.parse(await fs.readFile(cacheFile, "utf8"));
}

function limitRegulationCacheFile(format) {
  return path.join(LIMIT_REGULATION_DIR, `${normalizeFormat(format)}.json`);
}

async function getCachedDeckSearch(descriptor, producer, options = {}) {
  const cacheKey = deckSearchCacheKey(descriptor);
  const now = Date.now();
  const memory = deckSearchResultCache.get(cacheKey);
  if (!options.forceRefresh && memory && now - memory.at < DECK_SEARCH_CACHE_MS) {
    return { ...memory.payload, cache: "memory", stale: false };
  }

  const cacheFile = deckSearchCacheFile(cacheKey);
  const disk = await readDeckSearchCache(cacheFile).catch(() => null);
  if (!options.forceRefresh && disk?.samples) {
    const age = now - Date.parse(disk.cachedAt || 0);
    const stale = !Number.isFinite(age) || age > DECK_SEARCH_CACHE_MS;
    const payload = { ...disk, stale, cache: "disk" };
    deckSearchResultCache.set(cacheKey, { at: now, payload });
    if (stale) refreshDeckSearchInBackground(cacheKey, cacheFile, descriptor, producer);
    return payload;
  }

  return fetchAndCacheDeckSearch(cacheKey, cacheFile, descriptor, producer);
}

function refreshDeckSearchInBackground(cacheKey, cacheFile, descriptor, producer) {
  if (deckSearchRefreshes.has(cacheKey)) return;
  const refresh = fetchAndCacheDeckSearch(cacheKey, cacheFile, descriptor, producer)
    .catch((error) => console.warn(`deck search background refresh failed (${cacheKey}): ${error.message}`))
    .finally(() => deckSearchRefreshes.delete(cacheKey));
  deckSearchRefreshes.set(cacheKey, refresh);
}

async function fetchAndCacheDeckSearch(cacheKey, cacheFile, descriptor, producer) {
  const samples = await producer();
  const payload = {
    generatedAt: new Date().toISOString(),
    cachedAt: new Date().toISOString(),
    cacheVersion: DECK_SEARCH_CACHE_VERSION,
    cacheKey,
    cache: "refresh",
    stale: false,
    descriptor,
    samples,
  };
  await fs.mkdir(DECK_SEARCH_CACHE_DIR, { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify(payload, null, 2));
  deckSearchResultCache.set(cacheKey, { at: Date.now(), payload });
  return payload;
}

async function readDeckSearchCache(cacheFile) {
  return JSON.parse(await fs.readFile(cacheFile, "utf8"));
}

function deckSearchCacheFile(cacheKey) {
  return path.join(DECK_SEARCH_CACHE_DIR, `${cacheKey}.json`);
}

function deckSearchCacheKey(descriptor) {
  const normalized = {
    version: DECK_SEARCH_CACHE_VERSION,
    type: descriptor.type || "deck",
    format: normalizeFormat(descriptor.format),
    limit: Number(descriptor.limit || 36),
    cardId: Number(descriptor.cardId || 0),
    cardName: compactSpaces(descriptor.cardName || ""),
    cardArchetype: compactSpaces(descriptor.cardArchetype || ""),
    name: compactSpaces(descriptor.name || ""),
  };
  return crypto.createHash("sha1").update(JSON.stringify(normalized)).digest("hex").slice(0, 20);
}

async function getTextViaCurl(url) {
  return getText(url, 25000);
}

async function searchDecksByCard(cardId, limit, format = "tcg", cardName = "", cardArchetype = "", forceRefresh = false) {
  const metaPayload = await readMetaPayload().catch(() => ({ samples: [] }));
  const matchCardIds = await resolveMatchCardIds(cardId).catch(() => [cardId]);
  const tournamentMatches = (metaPayload.samples || [])
    .filter((sample) => sampleFormat(sample) === format)
    .filter((sample) => deckContainsAnyCard(sample, matchCardIds))
    .map((sample) => ({
      id: sample.id || null,
      title: sample.title || "Untitled Tournament Deck",
      url: sample.url || "https://ygoprodeck.com/category/format/tournament%20meta%20decks",
      source: sample.source || sourceNameForSample(sample),
      format: sampleFormat(sample),
      creator: sample.creator || "",
      tournament: sample.tournament || "",
      placement: sample.placement || "",
      date: sample.date || "",
      views: Number(sample.views || 0),
      rating: 0,
      archetypes: sample.archetypes || [],
      mainIds: sample.mainIds || [],
      extraIds: sample.extraIds || [],
      sideIds: sample.sideIds || [],
      metaText: sample.metaText || "",
      sourceRank: 0,
      ageDays: ageDays(sample.date),
    }));
  const duelingNexusMatches = await searchDuelingNexusDecks(matchCardIds, cardName, cardArchetype, format, limit).catch((error) => {
    console.warn(`dueling nexus fallback (${format}): ${error.message}`);
    return [];
  });
  const metaSiteMatches = await searchMetaSiteDecks(matchCardIds, cardName, cardArchetype, format, limit, forceRefresh).catch((error) => {
    console.warn(`meta site fallback (${format}): ${error.message}`);
    return [];
  });

  const url = new URL("https://ygoprodeck.com/api/decks/getDecks.php");
  url.searchParams.set("cardcode", String(cardId));
  url.searchParams.set("limit", String(Math.min(80, Math.max(24, limit * 3))));
  url.searchParams.set("offset", "0");
  url.searchParams.set("sort", "Deck Views");
  const deckFormat = deckApiFormat(format);
  if (deckFormat) url.searchParams.set("format", deckFormat);

  let payload = [];
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 Codex local prototype deck search" },
    });
    if (!response.ok) throw new Error(`YGOPRODeck deck search ${response.status}`);
    payload = await response.json();
  } catch (error) {
    console.warn(`public deck search fallback (${format}): ${error.message}`);
    return uniqueDeckSamples([...metaSiteMatches, ...tournamentMatches, ...duelingNexusMatches])
      .sort(compareDeckFreshness)
      .slice(0, limit);
  }
  if (!Array.isArray(payload)) {
    return uniqueDeckSamples([...metaSiteMatches, ...tournamentMatches, ...duelingNexusMatches])
      .sort(compareDeckFreshness)
      .slice(0, limit);
  }

  const publicMatches = payload.map((deck) => {
    const deckNum = Number(deck.deckNum || deck.deck_id || 0);
    const slug = deck.pretty_url || slugify(deck.deck_name || "deck");
    const date = deck.edit_date || deck.submit_date || "";
    return {
      id: deckNum || null,
      title: decodeHtml(deck.deck_name || "Untitled Deck"),
      url: deckNum ? `https://ygoprodeck.com/deck/${slug}-${deckNum}` : "https://ygoprodeck.com/deck-search/",
      source: deck.tournamentName ? "YGOPRODeck Tournament/User Deck" : "YGOPRODeck Public Deck",
      format,
      creator: decodeHtml(deck.username || deck.tournamentPlayerName || ""),
      tournament: decodeHtml(deck.tournamentName || deck.format || ""),
      placement: decodeHtml(deck.tournamentPlacement || ""),
      date,
      views: Number(deck.deck_views || 0),
      rating: Number(deck.rating || 0),
      archetypes: [],
      mainIds: parseDeckIds(deck.main_deck),
      extraIds: parseDeckIds(deck.extra_deck),
      sideIds: parseDeckIds(deck.side_deck),
      metaText: compactSpaces(decodeHtml(stripTags(deck.deck_excerpt || deck.deck_description || ""))).slice(0, 260),
      sourceRank: 2,
      ageDays: ageDays(date),
    };
  });

  return uniqueDeckSamples([...metaSiteMatches, ...tournamentMatches, ...duelingNexusMatches, ...publicMatches].filter((sample) => sample.format === format))
    .sort(compareDeckFreshness)
    .slice(0, limit);
}

async function searchDecksByArchetype(name, limit, format = "tcg", forceRefresh = false) {
  const needle = normalizeName(name);
  const titleMatches = (sample) => {
    const haystack = normalizeName(`${sample.title || ""} ${(sample.archetypes || []).join(" ")} ${sample.tournament || ""} ${sample.metaText || ""}`);
    if (!needle || !haystack) return false;
    return haystack.includes(needle) || needle.includes(haystack);
  };

  const metaPayload = await readMetaPayload().catch(() => ({ samples: [] }));
  const tournamentMatches = (metaPayload.samples || [])
    .filter((sample) => sampleFormat(sample) === format)
    .filter(titleMatches)
    .map((sample) => ({
      ...sample,
      format: sampleFormat(sample),
      sourceRank: 0,
      ageDays: ageDays(sample.date),
    }));

  const metaSiteMatches = await searchMetaSiteDecksByName(name, format, limit, forceRefresh).catch((error) => {
    console.warn(`archetype meta site fallback (${format}): ${error.message}`);
    return [];
  });

  return uniqueDeckSamples([...metaSiteMatches, ...tournamentMatches])
    .sort(compareDeckFreshness)
    .slice(0, limit);
}

function resolveDeckSearchAlias(name) {
  const raw = compactSpaces(name);
  if (!raw) return raw;
  if (DECK_SEARCH_ALIASES[raw]) return DECK_SEARCH_ALIASES[raw];
  const normalized = normalizeName(raw);
  const rawAliasKey = aliasCompareKey(raw);
  for (const [label, canonical] of Object.entries(DECK_SEARCH_ALIASES)) {
    const normalizedLabel = normalizeName(label);
    if (normalized && normalizedLabel && normalizedLabel === normalized) return canonical;
    if (rawAliasKey && aliasCompareKey(label) === rawAliasKey) return canonical;
  }
  return raw;
}

function isUnrecognizedCjkDeckQuery(requestedName, resolvedName) {
  const raw = compactSpaces(requestedName);
  if (!raw || !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(raw)) return false;
  return aliasCompareKey(raw) === aliasCompareKey(resolvedName);
}

function aliasCompareKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[&＆]/g, "and")
    .replace(/[\s・·._'’"“”\-－!！?？:：,，.。/\\()[\]{}<>《》「」『』【】]+/g, "")
    .trim();
}

async function buildFormatTrends(format, forceRefresh = false) {
  const cacheKey = `format-trends:${format}`;
  const cached = trendCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.at < META_DECK_CACHE_MS) return cached.payload;

  const items = [];
  const sources = new Set();
  const generatedAt = new Date().toISOString();
  const windowDays = format === "md" ? 14 : 30;

  if (format === "md" || format === "ocg") {
    const decks = await fetchMetaSiteDecks(format, forceRefresh).catch((error) => {
      console.warn(`trend meta site fallback (${format}): ${error.message}`);
      return [];
    });
    const source = format === "md" ? "Master Duel Meta Top Decks" : "Yu-Gi-Oh! Meta OCG Top Decks";
    sources.add(source);
    addDeckTypeCounts(items, decks, source, 1);
  }

  if (format === "ocg") {
    const [rotk, neuron] = await Promise.all([
      fetchRoadOfKingTrendItems().catch((error) => {
        console.warn(`road of the king trends unavailable: ${error.message}`);
        return [];
      }),
      fetchKonamiNeuronTrends().catch((error) => {
        console.warn(`konami neuron trends unavailable: ${error.message}`);
        return [];
      }),
    ]);
    for (const item of rotk) {
      sources.add(item.source);
      items.push(item);
    }
    for (const item of neuron) {
      sources.add(item.source);
      items.push(item);
    }
  }

  if (format === "tcg") {
    const metaPayload = await readMetaPayload().catch(() => ({ samples: [] }));
    const recentSamples = (metaPayload.samples || []).filter((sample) => sampleFormat(sample) === "tcg" && ageDays(sample.date) <= 30);
    sources.add("YGOPRODeck Tournament Meta");
    addSampleCounts(items, recentSamples, "YGOPRODeck Tournament Meta", 1);
  }

  const aggregate = aggregateTrendItems(items)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 10);
  const chartTotal = aggregate.reduce((sum, item) => sum + item.count, 0);
  const sourceTotal = items.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const payload = {
    format,
    generatedAt,
    windowDays,
    total: chartTotal,
    chartTotal,
    sourceTotal,
    sources: [...sources].filter(Boolean),
    items: aggregate,
  };
  trendCache.set(cacheKey, { at: Date.now(), payload });
  return payload;
}

async function buildPowerRankings(format, forceRefresh = false) {
  const cacheKey = `power-rankings:${format}`;
  const cached = powerRankingCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.at < POWER_RANKING_CACHE_MS) return cached.payload;

  const payload = format === "md"
    ? await fetchMasterDuelMetaPowerRankings()
    : await buildFallbackPowerRankings(format, forceRefresh);
  powerRankingCache.set(cacheKey, { at: Date.now(), payload });
  return payload;
}

async function fetchMasterDuelMetaPowerRankings() {
  const sourceUrl = "https://www.masterduelmeta.com/tier-list#power-rankings";
  const html = await getText("https://www.masterduelmeta.com/tier-list").catch(() => getTextViaCurl("https://www.masterduelmeta.com/tier-list"));
  const markers = [...html.matchAll(/<img[^>]+alt="(Tier\s+\d+|Trending)"[^>]*>/gi)].map((match) => ({
    label: decodeHtml(match[1]),
    index: match.index || 0,
  }));
  const descriptions = {
    "Tier 1": "Power >= 12",
    "Tier 2": "Power 7-12",
    "Tier 3": "Power 3-7",
    Trending: "Power 1-3",
  };
  const groups = [];

  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    if (/trending/i.test(marker.label)) continue;
    const next = markers[index + 1]?.index ?? html.length;
    const section = html.slice(marker.index, next);
    const items = parseMdmPowerItems(section);
    groups.push({
      tier: marker.label,
      label: marker.label.toUpperCase(),
      description: descriptions[marker.label] || "",
      items,
    });
  }
  const normalizedGroups = normalizePowerTierGroups(groups, descriptions);

  return {
    format: "md",
    generatedAt: new Date().toISOString(),
    source: "Master Duel Meta Power Rankings",
    sourceUrl,
    groups: normalizedGroups,
  };
}

function parseMdmPowerItems(section) {
  const items = [];
  const pattern = /<a[^>]+href="([^"]*\/tier-list\/(?:deck-types|engines)\/[^"]+)"[\s\S]*?<div class="label[^"]*">([\s\S]*?)<\/div>\s*<\/a>\s*<\/div>\s*<div class="power-label[^"]*">Power:\s*<b>([\d.]+)<\/b>/gim;
  for (const match of section.matchAll(pattern)) {
    const href = decodeHtml(match[1]);
    const rawLabel = compactSpaces(decodeHtml(stripTags(match[2])));
    const name = rawLabel.replace(/\s+ENGINE$/i, "");
    const image = firstSrcsetUrl(match[0]);
    const power = Number(match[3]);
    if (!name || !Number.isFinite(power)) continue;
    items.push({
      name,
      label: rawLabel,
      power,
      url: href.startsWith("http") ? href : `https://www.masterduelmeta.com${href}`,
      image,
      kind: href.includes("/engines/") ? "engine" : "deck",
    });
  }
  return items;
}

function firstSrcsetUrl(html) {
  const srcset = html.match(/srcset="([^"]+)"/i)?.[1] || "";
  const first = srcset.split(",")[0]?.trim().split(/\s+/)[0] || "";
  if (first) return decodeHtml(first);
  const src = html.match(/\ssrc="([^"]+)"/i)?.[1] || "";
  return decodeHtml(src);
}

async function buildFallbackPowerRankings(format, forceRefresh = false) {
  const trends = await buildFormatTrends(format, forceRefresh);
  const items = (trends.items || []).map((item, index) => {
    const count = Number(item.count || 0);
    const total = Number(trends.chartTotal || trends.total || 1);
    const share = total ? count / total : 0;
    return {
      name: item.name,
      label: item.name,
      power: Number((share * 18 + Math.max(0, 8 - index) * 0.25).toFixed(1)),
      url: "",
      image: "",
      kind: "deck",
    };
  });

  return {
    format,
    generatedAt: new Date().toISOString(),
    source: `${trends.sources?.join(" / ") || "Recent topping samples"} power estimate`,
    sourceUrl: "",
    estimated: true,
    groups: normalizePowerTierGroups([
      { tier: "Tier 1", label: "TIER 1", description: "Estimated from recent samples", items: items.filter((item) => item.power >= 12) },
      { tier: "Tier 2", label: "TIER 2", description: "Estimated from recent samples", items: items.filter((item) => item.power >= 7 && item.power < 12) },
      { tier: "Tier 3", label: "TIER 3", description: "Estimated from recent samples", items: items.filter((item) => item.power >= 3 && item.power < 7) },
    ], {
      "Tier 1": "Estimated from recent samples",
      "Tier 2": "Estimated from recent samples",
      "Tier 3": "Estimated from recent samples",
    }),
  };
}

function normalizePowerTierGroups(groups, descriptions = {}) {
  const byTier = new Map();
  for (const group of groups || []) {
    const tier = normalizePowerTierName(group.tier || group.label);
    if (!tier || tier === "Trending") continue;
    byTier.set(tier, {
      tier,
      label: tier.toUpperCase(),
      description: group.description || descriptions[tier] || "",
      items: group.items || [],
    });
  }
  return ["Tier 1", "Tier 2", "Tier 3"].map((tier) => byTier.get(tier) || {
    tier,
    label: tier.toUpperCase(),
    description: descriptions[tier] || "",
    items: [],
  });
}

function normalizePowerTierName(value) {
  const raw = String(value || "");
  const match = raw.match(/tier\s*([123])/i);
  if (match) return `Tier ${match[1]}`;
  if (/trending/i.test(raw)) return "Trending";
  return "";
}

function addDeckTypeCounts(items, decks, source, weight) {
  for (const deck of decks || []) {
    if (ageDays(deck.created || deck.uploaded || deck.updated || "") > 30) continue;
    const name = cleanTrendName(deck.deckType?.name || deck.tournamentType?.name || "");
    if (!name) continue;
    items.push({ name, count: weight, source });
  }
}

function addSampleCounts(items, samples, source, weight) {
  for (const sample of samples || []) {
    const name = cleanTrendName(sample.archetypes?.[0] || sample.title || "");
    if (!name) continue;
    items.push({ name, count: weight, source });
  }
}

function aggregateTrendItems(items) {
  const byName = new Map();
  for (const item of items || []) {
    const name = cleanTrendName(item.name);
    if (!name) continue;
    const current = byName.get(name) || { name, count: 0, sources: [] };
    current.count += Number(item.count || 0);
    if (item.source && !current.sources.includes(item.source)) current.sources.push(item.source);
    byName.set(name, current);
  }
  return [...byName.values()];
}

async function fetchRoadOfKingTrendItems() {
  const posts = await getJson("https://roadoftheking.com/wp-json/wp/v2/posts?per_page=12&_fields=title,link,date,excerpt,categories")
    .catch(async () => JSON.parse(await getTextViaCurl("https://roadoftheking.com/wp-json/wp/v2/posts?per_page=12&_fields=title,link,date,excerpt,categories")));
  const items = [];
  for (const post of posts || []) {
    const title = decodeHtml(stripTags(post.title?.rendered || ""));
    if (!/ocg/i.test(title) || !/metagame report/i.test(title) || ageDays(post.date) > 35) continue;
    const html = await getText(post.link).catch(() => "");
    for (const row of parseRoadOfKingBreakdown(html)) {
      items.push({ ...row, source: "Road of the King OCG Breakdown" });
    }
  }
  return items;
}

function parseRoadOfKingBreakdown(html) {
  const start = html.search(/Metagame Breakdown/i);
  if (start < 0) return [];
  const section = html.slice(start, start + 8000);
  const list = section.match(/<ul>([\s\S]*?)<\/ul>/i)?.[1] || "";
  const rows = [];
  for (const match of list.matchAll(/<li>\s*(\d+)\s+([^<(]+)(?:\s*\(|<\/li>)/gim)) {
    const count = Number(match[1]);
    const name = cleanTrendName(decodeHtml(stripTags(match[2])));
    if (count && name) rows.push({ name, count });
  }
  return rows;
}

async function fetchKonamiNeuronTrends() {
  const url = "https://www.db.yugioh-card.com/yugiohdb/trends_search.action?ope=1&request_locale=en";
  const html = await getText(url).catch(() => getTextViaCurl(url));
  const names = [...html.matchAll(/<div class="t_row[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gim)]
    .map((row) => row[0].match(/<h3>\s*([\s\S]*?)\s*<\/h3>/i)?.[1] || "")
    .map((name) => cleanTrendName(decodeHtml(stripTags(name))))
    .filter(Boolean)
    .slice(0, 30);
  return names.map((name, index) => ({
    name,
    count: Math.max(1, 31 - index),
    source: "Konami Neuron Popular Decks Ranking",
  }));
}

function cleanTrendName(value) {
  return compactSpaces(decodeHtml(stripTags(value)))
    .replace(/\s+Deck$/i, "")
    .replace(/\s+\d+.*$/, "")
    .trim();
}

async function searchMetaSiteDecks(matchCardIds, cardName, cardArchetype, format, limit, forceRefresh = false) {
  if (!["ocg", "md"].includes(format)) return [];
  const { nameMap } = await getCardIndex();
  const decks = await fetchMetaSiteDecks(format, forceRefresh);
  const matches = [];

  for (const deck of decks) {
    if (format === "ocg" && (!deck.ocg || deck.genesys)) continue;
    if (format === "md" && deck.rankedType?.includeInStats === false) continue;

    const mainIds = idsFromMetaRows(deck.main, nameMap);
    const extraIds = idsFromMetaRows(deck.extra, nameMap);
    const sideIds = idsFromMetaRows(deck.side, nameMap);
    if (mainIds.length < 20) continue;
    const allIds = [...mainIds, ...extraIds, ...sideIds];
    if (!matchCardIds.some((id) => allIds.includes(id))) continue;

    const source = format === "md" ? "Master Duel Meta Top Decks" : "Yu-Gi-Oh! Meta OCG Top Decks";
    const baseUrl = format === "md" ? "https://www.masterduelmeta.com" : "https://www.yugiohmeta.com";
    const event = deck.rankedType?.shortName || deck.rankedType?.name || deck.tournamentType?.shortName || deck.tournamentType?.name || "";
    const title = deck.deckType?.name || cardArchetype || cardName || "Meta Deck";
    const engines = normalizeMetaEngines(deck.engines);
    const notes = normalizeMetaNotes(deck.notes);
    matches.push({
      id: `${format}-meta:${deck._id || deck.url || `${title}:${deck.author}:${deck.created}`}`,
      title,
      url: deck.url ? `${baseUrl}${deck.url}` : `${baseUrl}/top-decks`,
      source,
      format,
      creator: decodeHtml(deck.author?.username || deck.author || ""),
      tournament: decodeHtml(event),
      placement: decodeHtml(deck.tournamentPlacement || ""),
      date: deck.created || deck.uploaded || deck.updated || "",
      views: Number(deck.duelRating || deck.deckPower || 0),
      rating: Number(deck.deckType?.tournamentPower || 0),
      engines,
      notes,
      archetypes: [deck.deckType?.name, ...engines].filter(Boolean),
      mainIds,
      extraIds,
      sideIds,
      metaText: compactSpaces(`${source} ${event} ${title} ${engines.join(" ")} ${notes}`).slice(0, 320),
      sourceRank: 0,
      ageDays: ageDays(deck.created || deck.uploaded || deck.updated || ""),
    });
  }

  return matches.slice(0, Math.max(limit, 48));
}

async function searchMetaSiteDecksByName(name, format, limit, forceRefresh = false) {
  if (!["ocg", "md"].includes(format)) return [];
  const { nameMap } = await getCardIndex();
  const decks = await fetchMetaSiteDecks(format, forceRefresh);
  const needle = normalizeName(name);
  const matches = [];

  for (const deck of decks) {
    if (format === "ocg" && (!deck.ocg || deck.genesys)) continue;
    if (format === "md" && deck.rankedType?.includeInStats === false) continue;

    const deckName = deck.deckType?.name || "";
    const engines = (deck.engines || []).map((engine) => engine.name).filter(Boolean);
    const deckNameKey = normalizeName(deckName);
    const engineKeys = engines.map(normalizeName);
    const haystack = normalizeName(`${deckName} ${engines.join(" ")} ${deck.rankedType?.name || ""} ${deck.tournamentType?.name || ""}`);
    if (!haystack.includes(needle) && !(deckNameKey && needle.includes(deckNameKey))) continue;

    const sample = metaSiteDeckToSample(deck, format, nameMap, name);
    if (sample && sample.mainIds.length >= 20) {
      if (deckNameKey === needle) sample.sourceRank = 0;
      else if (deckNameKey.includes(needle) || needle.includes(deckNameKey)) sample.sourceRank = 1;
      else if (engineKeys.some((engine) => engine === needle || engine.includes(needle) || needle.includes(engine))) sample.sourceRank = 2;
      else sample.sourceRank = 3;
      matches.push(sample);
    }
  }

  return matches.slice(0, Math.max(limit, 48));
}

function metaSiteDeckToSample(deck, format, nameMap, fallbackTitle = "Meta Deck") {
  const mainIds = idsFromMetaRows(deck.main, nameMap);
  const extraIds = idsFromMetaRows(deck.extra, nameMap);
  const sideIds = idsFromMetaRows(deck.side, nameMap);
  if (mainIds.length < 20) return null;

  const source = format === "md" ? "Master Duel Meta Top Decks" : "Yu-Gi-Oh! Meta OCG Top Decks";
  const baseUrl = format === "md" ? "https://www.masterduelmeta.com" : "https://www.yugiohmeta.com";
  const event = deck.rankedType?.shortName || deck.rankedType?.name || deck.tournamentType?.shortName || deck.tournamentType?.name || "";
  const title = deck.deckType?.name || fallbackTitle || "Meta Deck";
  const engines = normalizeMetaEngines(deck.engines);
  const notes = normalizeMetaNotes(deck.notes);
  return {
    id: `${format}-meta:${deck._id || deck.url || `${title}:${deck.author}:${deck.created}`}`,
    title,
    url: deck.url ? `${baseUrl}${deck.url}` : `${baseUrl}/top-decks`,
    source,
    format,
    creator: decodeHtml(deck.author?.username || deck.author || ""),
    tournament: decodeHtml(event),
    placement: decodeHtml(deck.tournamentPlacement || ""),
    date: deck.created || deck.uploaded || deck.updated || "",
    views: Number(deck.duelRating || deck.deckPower || 0),
    rating: Number(deck.deckType?.tournamentPower || 0),
    engines,
    notes,
    archetypes: [deck.deckType?.name, ...engines].filter(Boolean),
    mainIds,
    extraIds,
    sideIds,
    metaText: compactSpaces(`${source} ${event} ${title} ${engines.join(" ")} ${notes}`).slice(0, 320),
    sourceRank: 0,
    ageDays: ageDays(deck.created || deck.uploaded || deck.updated || ""),
  };
}

function normalizeMetaEngines(engines) {
  return (Array.isArray(engines) ? engines : [])
    .map((engine) => compactSpaces(decodeHtml(stripTags(engine?.name || engine?.deckType?.name || engine?.title || engine || ""))))
    .filter(Boolean)
    .slice(0, 4);
}

function normalizeMetaNotes(notes) {
  if (!notes) return "";
  if (typeof notes === "string") return compactSpaces(decodeHtml(stripTags(notes))).slice(0, 180);
  if (Array.isArray(notes)) {
    return notes.map(normalizeMetaNotes).filter(Boolean).join(" · ").slice(0, 180);
  }
  if (typeof notes === "object") {
    return compactSpaces(decodeHtml(stripTags(notes.text || notes.body || notes.title || notes.name || notes.label || ""))).slice(0, 180);
  }
  return "";
}

async function fetchMetaSiteDecks(format, forceRefresh = false) {
  const cacheKey = `meta-site:${format}`;
  const cached = metaDeckCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.at < META_DECK_CACHE_MS) return cached.decks;

  const host = format === "md" ? "https://www.masterduelmeta.com" : "https://www.yugiohmeta.com";
  const url = new URL(`${host}/api/v1/top-decks`);
  url.searchParams.set("created[$gte]", format === "md" ? "(days-14)" : "(days-30)");
  url.searchParams.set("fields", "-_id,-__v");
  url.searchParams.set("limit", "0");
  url.searchParams.set("sort", "-created");

  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 Codex local prototype deck search" },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`${host} top-decks ${response.status}`);
  const payload = await response.json();
  const decks = Array.isArray(payload) ? payload : payload ? [payload] : [];
  metaDeckCache.set(cacheKey, { at: Date.now(), decks });
  return decks;
}

async function searchDuelingNexusDecks(matchCardIds, cardName, cardArchetype, format, limit) {
  const terms = [...new Set([cardName, cardArchetype].map((term) => term.trim()).filter(Boolean))];
  if (format !== "tcg" || !terms.length) return [];
  const validCardIds = await getValidCardIds().catch((error) => {
    console.warn(`card id normalizer fallback: ${error.message}`);
    return null;
  });
  const decks = [];
  for (const term of terms) {
    const response = await fetch("https://duelingnexus.com/api/deck-search.php", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "user-agent": "Mozilla/5.0 Codex local prototype deck search",
      },
      body: new URLSearchParams({
        name: term,
        tag: "-1",
        special: "-1",
        sort: "0",
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Dueling Nexus ${response.status}`);
    const payload = await response.json();
    if (payload?.success && Array.isArray(payload.decks)) decks.push(...payload.decks);
  }

  return decks
    .map((deck) => {
      const mainIds = parseDeckIds(deck.main_deck, validCardIds);
      const extraIds = parseDeckIds(deck.extra_deck, validCardIds);
      const sideIds = parseDeckIds(deck.side_deck, validCardIds);
      const allIds = [...mainIds, ...extraIds, ...sideIds];
      if (!matchCardIds.some((id) => allIds.includes(id)) || mainIds.length < 20) return null;
      const deckFormat = sampleFormat({ format: deck.banlist || "tcg" });
      return {
        id: `dn:${deck.uuid}`,
        title: decodeHtml(deck.name || "Untitled Dueling Nexus Deck"),
        url: `https://duelingnexus.com/editor/${deck.uuid}`,
        source: "Dueling Nexus Community Decks",
        format: deckFormat,
        creator: decodeHtml(deck.username || ""),
        tournament: decodeHtml(deck.banlist || ""),
        placement: "",
        date: deck.date_updated || deck.date_shared || "",
        views: Number(deck.views || 0),
        rating: 0,
        archetypes: [],
        mainIds,
        extraIds,
        sideIds,
        metaText: compactSpaces(`Dueling Nexus ${deck.banlist || ""} updated ${deck.date_updated || ""}`).slice(0, 260),
        sourceRank: 1,
        ageDays: ageDays(deck.date_updated || deck.date_shared || ""),
      };
    })
    .filter((sample) => sample && sample.format === format)
    .slice(0, Math.max(limit, 24));
}

async function getValidCardIds() {
  return (await getCardIndex()).idMap;
}

async function resolveMatchCardIds(cardId) {
  const { idMap } = await getCardIndex();
  const canonical = idMap.get(Number(cardId));
  return [...new Set([canonical, Number(cardId)].filter(Boolean))];
}

function deckContainsAnyCard(sample, matchCardIds) {
  const cards = [...(sample.mainIds || []), ...(sample.extraIds || []), ...(sample.sideIds || [])];
  return matchCardIds.some((id) => cards.includes(id));
}

async function getCardIndex() {
  cardIndexPromise ||= loadCardDbPayload()
    .then((payload) => {
      const idMap = new Map();
      const nameMap = new Map();
      for (const card of payload.data || []) {
        const canonicalId = Number(card.id);
        if (canonicalId) {
          idMap.set(canonicalId, canonicalId);
          nameMap.set(normalizeName(card.name), canonicalId);
        }
        for (const image of card.card_images || []) {
          if (image.id && canonicalId) idMap.set(Number(image.id), canonicalId);
        }
      }
      return { payload, idMap, nameMap };
    })
    .catch((error) => {
      cardIndexPromise = null;
      throw error;
    });
  return cardIndexPromise;
}

async function loadCardDbPayload() {
  const cached = await readCachedCardDb();
  if (cached) return cached;

  const response = await fetch(CARD_DB_URL, {
    headers: { "user-agent": "Mozilla/5.0 Codex local prototype deck search" },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`card db ${response.status}`);
  const payload = await response.json();
  await fs.writeFile(CARD_CACHE_FILE, JSON.stringify(payload));
  return payload;
}

async function readCachedCardDb() {
  try {
    const stat = await fs.stat(CARD_CACHE_FILE);
    if (Date.now() - stat.mtimeMs > CARD_CACHE_MS) return null;
    const payload = JSON.parse(await fs.readFile(CARD_CACHE_FILE, "utf8"));
    if (!hasKonamiIds(payload)) return null;
    return payload;
  } catch {
    return null;
  }
}

function hasKonamiIds(payload) {
  return (payload?.data || []).some((card) => (card.misc_info || []).some((info) => info.konami_id));
}

async function getAliasData() {
  aliasDataPromise ||= fs.readFile(ALIAS_FILE, "utf8").then((text) => JSON.parse(text));
  return aliasDataPromise;
}

async function getMasterDuelLocaleData() {
  masterDuelLocalePromise ||= fs.readFile(MASTER_DUEL_LOCALE_FILE, "utf8").then((text) => JSON.parse(text));
  return masterDuelLocalePromise;
}

function normalizeKonamiLocale(locale) {
  const raw = String(locale || "").toLowerCase();
  if (raw === "cn" || raw === "ja" || raw === "en") return raw;
  return "";
}

async function getOfficialCardLocale(cardId, locale) {
  const cached = await readOfficialLocaleCache(cardId, locale);
  if (cached) return cached;

  const { payload } = await getCardIndex();
  const card = (payload.data || []).find((item) => Number(item.id) === Number(cardId));
  const konamiId = (card?.misc_info || []).map((info) => Number(info.konami_id)).find(Boolean);
  if (!konamiId) return null;

  const url = `https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=${encodeURIComponent(konamiId)}&ope=2&request_locale=${encodeURIComponent(locale)}`;
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 Codex local prototype official locale cache" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) return null;

  const html = await response.text();
  const parsed = parseOfficialCardPage(html, locale);
  if (!parsed?.name) return null;

  const entry = {
    id: Number(cardId),
    konamiId,
    texts: {
      [localeTextKey(locale)]: {
        ...parsed,
        official: true,
        source: "KONAMI Yu-Gi-Oh! Neuron official card database",
        sourceUrl: url,
      },
    },
  };
  await writeOfficialLocaleCache(cardId, locale, entry);
  return entry;
}

async function readOfficialLocaleCache(cardId, locale) {
  const file = officialLocaleCacheFile(cardId, locale);
  try {
    const stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs > OFFICIAL_LOCALE_CACHE_MS) return null;
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function writeOfficialLocaleCache(cardId, locale, entry) {
  try {
    await fs.mkdir(OFFICIAL_LOCALE_CACHE_DIR, { recursive: true });
    await fs.writeFile(officialLocaleCacheFile(cardId, locale), JSON.stringify(entry));
  } catch {
    // Cache writes are best effort; the API response itself is still useful.
  }
}

function officialLocaleCacheFile(cardId, locale) {
  return path.join(OFFICIAL_LOCALE_CACHE_DIR, `${locale}-${Number(cardId)}.json`);
}

function localeTextKey(locale) {
  if (locale === "cn") return "zh-CN";
  if (locale === "ja") return "ja-JP";
  return "en";
}

function parseOfficialCardPage(html, locale) {
  const cardNameBlock = String(html || "").match(/<div id="cardname"[\s\S]*?<\/div>/i)?.[0] || "";
  const h1Block = matchFirst(cardNameBlock, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const name = cleanOfficialText(h1Block.replace(/<span[\s\S]*?<\/span>/gi, ""));
  const alternateName = cleanOfficialText(matchFirst(h1Block, /<span[^>]*>([\s\S]*?)<\/span>/i));
  const textBlock = matchFirst(html, /<div class="item_box_text">[\s\S]*?<div class="text_title">[\s\S]*?<\/div>([\s\S]*?)<\/div>/i);
  const desc = cleanOfficialText(textBlock);
  const speciesBlock = matchFirst(html, /<p class="species">([\s\S]*?)<\/p>/i);
  const typeLine = cleanOfficialText(speciesBlock);
  const title = cleanOfficialText(matchFirst(html, /<title>([\s\S]*?)<\/title>/i));
  if (!name || !title) return null;
  return {
    name,
    desc,
    alternateName,
    typeLine,
    locale,
  };
}

function matchFirst(text, pattern) {
  return String(text || "").match(pattern)?.[1] || "";
}

function cleanOfficialText(text) {
  return decodeHtmlEntities(
    String(text || "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\s*／\s*/g, "／")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      try {
        results[current] = await mapper(items[current], current);
      } catch {
        results[current] = null;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function getPackIndex() {
  packIndexPromise ||= fs.readFile(PACK_INDEX_FILE, "utf8").then((text) => JSON.parse(text));
  return packIndexPromise;
}

function idsFromMetaRows(rows, nameMap) {
  const ids = [];
  for (const row of rows || []) {
    const id = nameMap.get(normalizeName(row.card?.name || row.name || ""));
    const amount = Math.max(1, Number(row.amount || row.qty || row.count || 1));
    if (!id) continue;
    for (let i = 0; i < amount; i += 1) ids.push(id);
  }
  return ids;
}

function normalizeFormat(value) {
  const text = String(value || "").toLowerCase();
  if (text === "ocg") return "ocg";
  if (text === "md" || text === "master-duel" || text === "master duel") return "md";
  return "tcg";
}

function sampleFormat(sample) {
  const text = `${sample.format || ""} ${sample.categoryUrl || ""} ${sample.source || ""} ${sample.tournament || ""} ${sample.title || ""}`.toLowerCase();
  if (text.includes("master duel") || /\bmd\b/.test(text)) return "md";
  if (text.includes("ocg")) return "ocg";
  return "tcg";
}

function sourceNameForSample(sample) {
  const format = sampleFormat(sample).toUpperCase();
  return `YGOPRODeck Recent Tournament Meta ${format}`;
}

function deckApiFormat(format) {
  if (format === "md") return "Master Duel Decks";
  if (format === "tcg") return "Tournament Meta Decks";
  return "";
}

function compareDeckFreshness(a, b) {
  if (a.sourceRank !== b.sourceRank) return a.sourceRank - b.sourceRank;
  if (a.ageDays !== b.ageDays) return a.ageDays - b.ageDays;
  if (b.views !== a.views) return b.views - a.views;
  return String(a.title).localeCompare(String(b.title));
}

function uniqueDeckSamples(samples) {
  const seen = new Set();
  const unique = [];
  for (const sample of samples) {
    const key = sample.id ? `id:${sample.id}` : `${sample.title}|${sample.creator}|${(sample.mainIds || []).join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(sample);
  }
  return unique;
}

function ageDays(value) {
  const text = String(value || "").trim();
  if (!text) return 999999;

  const relative = text.match(/(\d+)\s+(day|week|month|year)s?\s+ago/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    if (unit === "day") return amount;
    if (unit === "week") return amount * 7;
    if (unit === "month") return amount * 30;
    if (unit === "year") return amount * 365;
  }

  const cleaned = text.replace(/(\d{1,2})(st|nd|rd|th)/gi, "$1");
  const time = Date.parse(cleaned);
  if (Number.isFinite(time)) return Math.max(0, Math.round((Date.now() - time) / 86400000));
  return 999999;
}

function parseDeckIds(value, validCardIds = null) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((id) => normalizeCardId(id, validCardIds)).filter(Boolean);
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((id) => normalizeCardId(id, validCardIds)).filter(Boolean) : [];
  } catch {
    return String(value)
      .split(",")
      .map((id) => normalizeCardId(id, validCardIds))
      .filter(Boolean);
  }
}

function normalizeCardId(value, validCardIds = null) {
  const raw = Number(value);
  if (!raw) return 0;
  const mapped = validCardIds?.get(raw);
  if (mapped) return mapped;
  const text = String(value).replace(/\D/g, "");
  if (!validCardIds && text.length > 8) return Number(text.slice(-8));
  if (!validCardIds) return raw;
  for (let size = 8; size >= 5; size -= 1) {
    const suffix = Number(text.slice(-size));
    const suffixMapped = validCardIds.get(suffix);
    if (suffixMapped) return suffixMapped;
  }
  return raw;
}

function slugify(value) {
  return String(value || "deck")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function listenOnAvailablePort(server, port) {
  return new Promise((resolve, reject) => {
    const tryListen = (candidate) => {
      server.once("error", (error) => {
        if (error.code === "EADDRINUSE" && candidate < START_PORT + 20) {
          tryListen(candidate + 1);
        } else {
          reject(error);
        }
      });
      server.listen(candidate, HOST, () => resolve(candidate));
    };
    tryListen(port);
  });
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]*>/g, " ");
}

function compactSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeName(value) {
  return decodeHtml(value)
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/["“”]/g, "")
    .replace(/[^a-z0-9'+& -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&ndash;", "-")
    .replaceAll("&mdash;", "-")
    .replaceAll("&nbsp;", " ")
    .replaceAll(" ", " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
