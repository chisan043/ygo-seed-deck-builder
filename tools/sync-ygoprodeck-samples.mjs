import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const OUT = path.join(ROOT, "data", "meta-samples.js");
const CARD_DB_URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php";
const CATEGORIES = [
  "https://ygoprodeck.com/category/format/tournament%20meta%20decks",
  "https://ygoprodeck.com/category/format/tournament%20meta%20decks%20ocg",
];
const KONAMI_DECK_LIST_URLS = [
  "https://yugiohblog.konami.com/2026/ycs/advanced-format-main-event-top-32-deck-lists/",
];
const ROAD_OF_THE_KING_POSTS = "https://roadoftheking.com/wp-json/wp/v2/posts?per_page=8&_fields=title,link,date,excerpt,categories";
const MAX_DECKS_PER_CATEGORY = 14;

const headers = {
  "user-agent": "Mozilla/5.0 Codex local prototype deck sampler",
};
const execFileAsync = promisify(execFile);

async function main() {
  const cardIndex = await buildCardIndex().catch((error) => {
    console.warn(`card index unavailable: ${error.message}`);
    return { names: new Map(), ids: new Set() };
  });
  const links = [];
  for (const url of CATEGORIES) {
    try {
      const html = await getText(url);
      for (const link of parseCategoryLinks(html, url)) {
        if (!links.some((item) => item.url === link.url)) links.push(link);
        if (links.filter((item) => item.categoryUrl === url).length >= MAX_DECKS_PER_CATEGORY) break;
      }
    } catch (error) {
      console.warn(`skip category ${url}: ${error.message}`);
    }
  }

  const samples = [];
  for (const link of links) {
    try {
      const html = await getText(link.url);
      const sample = parseDeckPage(html, link);
      if (sample.mainIds.length >= 35) samples.push(sample);
    } catch (error) {
      console.warn(`skip ${link.url}: ${error.message}`);
    }
  }

  for (const sample of await fetchKonamiDeckLists(cardIndex)) {
    if (sample.mainIds.length >= 35) samples.push(sample);
  }

  const signals = await fetchRoadOfTheKingSignals().catch((error) => {
    console.warn(`road of the king signals unavailable: ${error.message}`);
    return [];
  });

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sources: [...CATEGORIES, ...KONAMI_DECK_LIST_URLS, ROAD_OF_THE_KING_POSTS],
    sourceStats: buildSourceStats(samples, signals),
    signals,
    samples,
  };

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, `window.YGO_META_SAMPLES = ${JSON.stringify(payload)};\n`, "utf8");
  console.log(`wrote ${samples.length} samples to ${OUT}`);
}

async function getText(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

async function getJson(url, timeoutMs = 20000) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function buildCardIndex() {
  const payload = await getJson(CARD_DB_URL, 60000);
  const names = new Map();
  const ids = new Set();
  for (const card of payload.data || []) {
    const id = Number(card.id);
    if (id) ids.add(id);
    addCardName(names, card.name, id);
    for (const image of card.card_images || []) {
      const imageId = Number(image.id);
      if (imageId) ids.add(imageId);
    }
  }
  return { names, ids };
}

function addCardName(map, name, id) {
  const key = normalizeName(name);
  if (key && id) map.set(key, id);
}

async function fetchKonamiDeckLists(cardIndex) {
  const samples = [];
  for (const url of KONAMI_DECK_LIST_URLS) {
    try {
      const html = await getTextAllowInvalidTls(url).catch(() => getTextViaCurl(url));
      samples.push(...parseKonamiDeckLists(html, url, cardIndex));
    } catch (error) {
      console.warn(`skip konami ${url}: ${error.message}`);
    }
  }
  return samples;
}

async function getTextViaCurl(url) {
  const { stdout } = await execFileAsync("curl", [
    "-L",
    "--compressed",
    "--max-time",
    "25",
    "-A",
    headers["user-agent"],
    "-s",
    url,
  ], { maxBuffer: 8 * 1024 * 1024 });
  if (!stdout) throw new Error("empty curl response");
  return stdout;
}

function parseKonamiDeckLists(html, url, cardIndex) {
  const title = textMatch(html, /<h2 class="spnc-entry-title">([\s\S]*?)<\/h2>/i) || "Konami Official Deck Lists";
  const date = textMatch(html, /<time[^>]*datetime="([^"]+)"/i) || "";
  const content = textMatchRaw(html, /<article[\s\S]*?<div class="entry-content spnc-entry-content">([\s\S]*?)<\/div>\s*<\/article>/i)
    || textMatchRaw(html, /<article[\s\S]*?<p><strong>([\s\S]*?)<\/article>/i)
    || html;
  const starts = [...content.matchAll(/<p><strong>(?!<u>)([\s\S]*?)<\/strong><\/p>/gim)]
    .map((match) => ({
      index: match.index,
      name: decodeHtml(stripTags(match[1])).replace(/\s+/g, " ").trim(),
    }))
    .filter((entry) => !/^(main deck|extra deck|side deck|monster cards|spell cards|trap cards)/i.test(entry.name));
  const samples = [];

  for (let i = 0; i < starts.length; i += 1) {
    const current = starts[i];
    const next = starts[i + 1]?.index ?? content.length;
    const block = content.slice(current.index, next);
    if (!/Main Deck:\s*\d+/i.test(block)) continue;

    const sections = parseKonamiSections(block, cardIndex);
    if (sections.mainIds.length < 35) continue;
    const player = current.name.replace(/\s*[-–—]\s*\d+.*$/, "").trim();
    const placement = (current.name.match(/[-–—]\s*(\d+)/) || [])[1];
    samples.push({
      id: `konami-${hashString(`${url}:${current.name}:${i}`)}`,
      title: player ? `${player} - ${title}` : title,
      url,
      categoryUrl: url,
      source: "Konami Official YCS Deck List",
      format: "tcg",
      creator: player,
      tournament: title,
      placement: placement ? `Top ${placement}` : "",
      date,
      views: 0,
      archetypes: [],
      mainIds: sections.mainIds,
      extraIds: sections.extraIds,
      sideIds: sections.sideIds,
      metaText: compactSpaces(`${title} ${current.name}`).slice(0, 320),
    });
  }

  return samples;
}

function getTextAllowInvalidTls(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers,
      rejectUnauthorized: false,
      timeout: 20000,
    }, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`${response.statusCode} ${response.statusMessage}`));
        return;
      }
      response.setEncoding("utf8");
      let body = "";
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => resolve(body));
    });
    request.on("timeout", () => {
      request.destroy(new Error("request timed out"));
    });
    request.on("error", reject);
  });
}

function parseKonamiSections(block, cardIndex) {
  const sectionRanges = [
    ["mainIds", /<strong><u>Main Deck:\s*\d+<\/u><\/strong>/i, /<strong><u>Extra Deck:\s*\d+<\/u><\/strong>/i],
    ["extraIds", /<strong><u>Extra Deck:\s*\d+<\/u><\/strong>/i, /<strong><u>Side Deck:\s*\d+<\/u><\/strong>/i],
    ["sideIds", /<strong><u>Side Deck:\s*\d+<\/u><\/strong>/i, null],
  ];
  const result = { mainIds: [], extraIds: [], sideIds: [] };
  for (const [key, startRe, endRe] of sectionRanges) {
    const start = block.search(startRe);
    if (start < 0) continue;
    const rest = block.slice(start);
    const end = endRe ? rest.search(endRe) : -1;
    const section = end >= 0 ? rest.slice(0, end) : rest;
    result[key] = idsFromCardLines(section, cardIndex);
  }
  return result;
}

function idsFromCardLines(html, cardIndex) {
  const text = decodeHtml(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\u00a0/g, " ");
  const ids = [];
  for (const line of text.split(/\n+/)) {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!match) continue;
    const qty = Number(match[1]);
    const name = normalizeName(match[2]);
    const id = cardIndex.names.get(name);
    if (!id) continue;
    for (let i = 0; i < qty; i += 1) ids.push(id);
  }
  return ids;
}

async function fetchRoadOfTheKingSignals() {
  const posts = await getJson(ROAD_OF_THE_KING_POSTS)
    .catch(async () => JSON.parse(await getTextViaCurl(ROAD_OF_THE_KING_POSTS)));
  return (posts || []).map((post) => {
    const text = compactSpaces(decodeHtml(stripTags(post.excerpt?.rendered || "")));
    const title = decodeHtml(stripTags(post.title?.rendered || "")).trim();
    return {
      source: "Road of the King",
      title,
      url: post.link,
      date: post.date,
      format: inferFormat(`${title} ${text}`),
      text: text.slice(0, 360),
    };
  }).filter((signal) => signal.title && signal.url);
}

function inferFormat(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("master duel")) return "md";
  if (text.includes("ocg") || text.includes("ycsj")) return "ocg";
  return "tcg";
}

function parseCategoryLinks(html, categoryUrl) {
  const links = [];
  const re = /<a\s+href="([^"]*\/deck\/[^"]+)"[^>]*>(.*?)<\/a>/gims;
  let match;
  while ((match = re.exec(html))) {
    const href = decodeHtml(match[1]);
    const title = stripTags(match[2]).trim();
    if (!title || title.length > 80) continue;
    const url = new URL(href, "https://ygoprodeck.com").href;
    links.push({ title, url, categoryUrl });
  }
  return links;
}

function parseDeckPage(html, link) {
  const title = textMatch(html, /<h1[^>]*>(.*?)<\/h1>/i) || link.title;
  const creator = textMatch(html, /Creator:\s*([^<\n]+)/i);
  const tournament = textMatch(html, /Tournament:\s*([^<\n]+)/i);
  const placement = textMatch(html, /Placement:\s*([^<\n]+)/i) || textMatch(html, /Reached\s*<b>(.*?)<\/b>/i);
  const views = Number((textMatch(html, /<i class="fa-solid fa-eye"><\/i>\s*([\d,]+)\s*Views/i) || "0").replaceAll(",", ""));
  const archetypes = [...html.matchAll(/<i class="fa-solid fa-tag"><\/i>\s*<a[^>]*>(.*?)<\/a>/gims)]
    .map((m) => stripTags(m[1]).trim())
    .filter(Boolean);
  const metaText = compactSpaces(metaTextFromPage(html));
  const date = extractDateText(metaText) || extractDateText(html);

  return {
    id: Number((link.url.match(/-(\d+)\/?$/) || [])[1]) || null,
    title,
    url: link.url,
    categoryUrl: link.categoryUrl,
    source: "YGOPRODeck Tournament Meta",
    creator: creator?.trim() || "",
    tournament: tournament?.trim() || "",
    placement: placement?.trim() || "",
    date: date?.trim() || "",
    views,
    archetypes,
    mainIds: idsFromSection(html, "main_deck"),
    extraIds: idsFromSection(html, "extra_deck"),
    sideIds: idsFromSection(html, "side_deck"),
    metaText: metaText.slice(0, 320),
  };
}

function metaTextFromPage(html) {
  return stripTags(textMatch(html, /<div class="deck-metadata-container[\s\S]*?<div id="deck-msg">/i) || "");
}

function extractDateText(value) {
  const text = stripTags(value);
  const match = text.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{4}\b/i);
  return match ? match[0].replace(/(\d{1,2})(st|nd|rd|th)/i, "$1") : "";
}

function idsFromSection(html, id) {
  const start = html.indexOf(`id="${id}"`);
  if (start < 0) return [];
  const nextCandidates = ["main_deck", "extra_deck", "side_deck"]
    .filter((candidate) => candidate !== id)
    .map((candidate) => html.indexOf(`id="${candidate}"`, start + 1))
    .filter((index) => index > start);
  const footer = html.indexOf("<h3>Deck Breakdown", start);
  if (footer > start) nextCandidates.push(footer);
  const end = nextCandidates.length ? Math.min(...nextCandidates) : Math.min(html.length, start + 30000);
  const section = html.slice(start, end);
  const ids = [];
  for (const match of section.matchAll(/href="\/card\/\?search=(\d+)"/g)) ids.push(Number(match[1]));
  return ids;
}

function textMatch(text, regex) {
  const match = text.match(regex);
  return match ? decodeHtml(stripTags(match[1] || match[0])).trim() : "";
}

function textMatchRaw(text, regex) {
  const match = text.match(regex);
  return match ? match[1] || match[0] : "";
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]*>/g, " ");
}

function compactSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function decodeHtml(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&ndash;", "-")
    .replaceAll("&mdash;", "-")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
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

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(i) | 0;
  }
  return Math.abs(hash).toString(36);
}

function buildSourceStats(samples, signals) {
  const stats = {};
  for (const sample of samples) {
    const key = sample.source || "Unknown";
    stats[key] = (stats[key] || 0) + 1;
  }
  for (const signal of signals) {
    const key = `${signal.source} Signals`;
    stats[key] = (stats[key] || 0) + 1;
  }
  return stats;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
