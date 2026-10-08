import path from "node:path";
import { DATA_DIR, cardMaps, cardNameKey, cleanText, fetchData, readJson } from "./data-utils.mjs";

const OCG_URL = "https://www.yugioh-card.com/japan/event/limitregulation/";
const TCG_URL = "https://www.yugioh-card.com/en/limited/";
const MD_URL = "https://dawnbrandbots.github.io/yaml-yugi-limit-regulation/master-duel/current.vector.json";

function isoDate(value) {
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : `${value} UTC`);
  if (!Number.isFinite(parsed)) throw new Error(`invalid regulation date: ${value}`);
  return new Date(parsed).toISOString().slice(0, 10);
}

function regulationFromRows(rows, cards, aliases = new Map()) {
  const { names } = cardMaps(cards);
  const regulation = {};
  const missing = [];
  for (const { name, japaneseName, limit } of rows) {
    const card = names.get(cardNameKey(name)) || aliases.get(cardNameKey(japaneseName));
    const konamiId = card?.misc_info?.find((info) => info.konami_id)?.konami_id;
    if (!konamiId) missing.push(name);
    else regulation[String(konamiId)] = limit;
  }
  if (missing.length) throw new Error(`cannot resolve official banlist cards: ${missing.join(", ")}`);
  if (Object.keys(regulation).length < 100) throw new Error("official banlist is unexpectedly empty or incomplete");
  return regulation;
}

export function discoverTcgLink(html, base = TCG_URL) {
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const link = links.find((match) => /\/limited\/list_[^/]+\/?$/.test(match[1]) && /view.*list|current|latest/i.test(cleanText(match[2])))
    || links.find((match) => /\/limited\/list_[^/]+\/?$/.test(match[1]));
  if (!link) throw new Error("official TCG current-list link not found");
  const url = new URL(link[1], base);
  if (url.origin !== new URL(TCG_URL).origin) throw new Error("unexpected TCG banlist host");
  return url.href;
}

export function parseTcgList(html, cards, today = new Date().toISOString().slice(0, 10)) {
  const text = cleanText(html);
  const effective = text.match(/Effective\s+from\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i)?.[1];
  const date = isoDate(effective);
  if (date > today) throw new Error(`TCG regulation is not effective until ${date}`);
  const rows = [];
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cleanText(cell[1]));
    const limit = { Forbidden: 0, Limited: 1, "Semi-Limited": 2, "Semi-limited": 2 }[cells[2]];
    if (limit !== undefined && cells[1]) rows.push({ name: cells[1], limit });
  }
  // The publisher can defer individual changes beyond the list's effective date.
  for (const note of text.matchAll(/changes to\s+([\s\S]*?)\s+from\s+(Forbidden|Limited|Semi-Limited)\s+to\s+(?:Unlimited|Forbidden|Limited|Semi-Limited)\s+do not take effect until\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/gi)) {
    if (isoDate(note[3]) <= today) continue;
    const names = [...note[1].matchAll(/["“]([^"”]+)["”]/g)].map((name) => name[1]);
    if (!names.length) throw new Error("unrecognized deferred TCG regulation change");
    for (const name of names) {
      const row = rows.find((item) => cardNameKey(item.name) === cardNameKey(name));
      const limit = { forbidden: 0, limited: 1, "semi-limited": 2 }[note[2].toLowerCase()];
      if (row) row.limit = limit;
      else rows.push({ name, limit });
    }
  }
  return { date, regulation: regulationFromRows(rows, cards) };
}

export function discoverOcgList(html, today = new Date().toISOString().slice(0, 10)) {
  const lists = [...html.matchAll(/<a\b[^>]*href=["']([^"']*\?list=\d+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => {
      const date = cleanText(match[2]).match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
      return date ? { date: `${date[1]}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}`, url: new URL(match[1], OCG_URL).href } : null;
    }).filter((list) => list && list.date <= today).sort((a, b) => b.date.localeCompare(a.date));
  if (!lists.length) throw new Error("official OCG effective-list link not found");
  return lists[0];
}

export function parseOcgList(html, cards, aliases = new Map()) {
  const rows = [];
  for (const section of html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2\b|$)/gi)) {
    const label = cleanText(section[1]);
    const limit = /^準制限カード/.test(label) ? 2 : /^禁止カード/.test(label) ? 0 : /^制限カード/.test(label) ? 1 : null;
    if (limit === null) continue;
    const cells = [...section[2].matchAll(/<td\b[^>]*class=["'][^"']*\bcell-tcg\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi)];
    const expected = Number(label.match(/(\d+)枚/)?.[1]);
    if (!cells.length || (expected && cells.length !== expected)) throw new Error(`incomplete OCG section: ${label}`);
    for (const row of section[2].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const name = row[1].match(/<td\b[^>]*class=["'][^"']*\bcell-tcg\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i)?.[1];
      const japaneseName = row[1].match(/<td\b[^>]*class=["'][^"']*\bcell-ocg\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i)?.[1];
      if (name) rows.push({ name: cleanText(name), japaneseName: cleanText(japaneseName), limit });
    }
  }
  return regulationFromRows(rows, cards, aliases);
}

export async function fetchCurrentRegulation(format, cards, { fetcher = fetchData, today = new Date().toISOString().slice(0, 10) } = {}) {
  let data;
  if (format === "md") {
    data = { ...await fetcher(MD_URL), source: "Dawnbrand Master Duel current regulation", sourceUrl: MD_URL };
  } else if (format === "ocg") {
    const list = discoverOcgList(await fetcher(OCG_URL, { json: false }), today);
    const aliasData = await readJson(path.join(DATA_DIR, "multilang-aliases.json")).catch(() => ({ entries: [] }));
    const cardsById = new Map(cards.map((card) => [Number(card.id), card]));
    const aliases = new Map(aliasData.entries.flatMap((entry) => (entry.names || []).map((name) => [cardNameKey(name.name), cardsById.get(Number(entry.id))])));
    const regulation = parseOcgList(await fetcher(list.url, { json: false }), cards, aliases);
    data = { date: list.date, regulation, source: "KONAMI OCG official regulation", sourceUrl: list.url };
  } else if (format === "tcg") {
    let url = discoverTcgLink(await fetcher(TCG_URL, { json: false }));
    let html = await fetcher(url, { json: false });
    const effective = cleanText(html).match(/Effective\s+from\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i)?.[1];
    if (isoDate(effective) > today) {
      const previous = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].find((match) => /previous/i.test(cleanText(match[2])));
      if (!previous) throw new Error("future TCG list has no previous-list link");
      url = new URL(previous[1], TCG_URL).href;
      if (new URL(url).origin !== new URL(TCG_URL).origin) throw new Error("unexpected previous TCG banlist host");
      html = await fetcher(url, { json: false });
    }
    data = { ...parseTcgList(html, cards, today), source: "KONAMI TCG official regulation", sourceUrl: url };
  } else throw new Error(`unknown format: ${format}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date || "") || data.date > today || Object.keys(data.regulation || {}).length < 100 || Object.values(data.regulation || {}).some((limit) => ![0, 1, 2, 3].includes(limit))) throw new Error(`invalid current ${format} regulation`);
  return { ...data, format, cachedAt: new Date().toISOString(), stale: false };
}
