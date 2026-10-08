import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import support from "../trend-support.js";
import { DATA_DIR, atomicWrite, readJson, readWindowCache, writeJson, writeWindowCache } from "./data-utils.mjs";

export function activeTrendNames(decks, power, trends = []) {
  return [...new Set([
    ...(decks.entries || []).filter(entry => entry.descriptor?.type === "archetype").map(entry => entry.descriptor.name),
    ...Object.values(power.formats || {}).flatMap(format => (format.groups || []).flatMap(group => (group.items || []).map(item => item.name))),
    ...trends.map(item => item.name),
  ].filter(Boolean))];
}

export async function buildTrendCatalog({ cards, locales, aliases, decks, power, previous = {}, trends = [], officialLocale }) {
  const entries = {};
  const officialCards = { ...previous.officialCards };
  const aliasById = new Map((aliases.entries || []).map(entry => [Number(entry.id), entry]));
  const families = new Map();
  for (const card of cards) {
    if (!card.archetype) continue;
    if (!families.has(card.archetype)) families.set(card.archetype, []);
    families.get(card.archetype).push(card);
  }
  function localizedNames(family) {
    return family.map(card => locales.cards?.[card.id]?.["zh-CN"]?.name
      || officialCards[card.id]?.name || aliasById.get(card.id)?.texts?.["zh-CN"]?.name)
      .filter(name => /[\u3400-\u9fff]/u.test(name || ""));
  }
  const preferred = { ...support.names.zh, ...locales.archetypes?.["zh-CN"] };
  for (const name of new Set([...families.keys(), ...Object.keys(preferred), ...Object.keys(support.names.ja)])) {
    const labels = { zh: preferred[name] || support.inferLabel(localizedNames(families.get(name) || [])), ja: support.names.ja[name] || "" };
    entries[support.key(name)] = { name, labels };
  }
  const catalog = { version: 1, entries, aliases: {}, officialCards };
  const names = activeTrendNames(decks, power, trends);
  // New paper-game families may precede Master Duel. Fetch the existing official
  // Neuron locale service only for families missing from the bundled translations.
  for (const name of names) {
    const parts = support.components(name, catalog);
    for (const entry of parts.filter(entry => !entry.labels.zh)) {
      const family = families.get(entry.name) || [];
      if (officialLocale) for (const card of family.slice(0, 8)) {
        try {
          const official = await officialLocale(card.id, "cn");
          const text = official?.texts?.["zh-CN"];
          if (text?.official && /[\u3400-\u9fff]/u.test(text.name)) officialCards[card.id] = text;
        } catch { /* A previous verified catalog remains available on source failure. */ }
      }
      entry.labels.zh = support.inferLabel(localizedNames(family));
    }
  }
  const cardsById = new Map(cards.map(card => [Number(card.id), card]));
  for (const card of cards) for (const image of card.card_images || []) cardsById.set(Number(image.id), card);
  const familyCatalog = { entries: Object.fromEntries(Object.entries(entries).filter(([, entry]) => families.has(entry.name))) };
  for (const name of names) {
    const parts = support.components(name, familyCatalog);
    const labels = {
      zh: support.labelFor(name, "zh", catalog) || (/^[^A-Za-z]*[\u3400-\u9fff]/u.test(name) ? name : ""),
      ja: support.labelFor(name, "ja", catalog),
    };
    const sampleIds = (decks.entries || []).filter(entry => entry.descriptor?.name === name)
      .flatMap(entry => (entry.samples || []).flatMap(sample => [...sample.mainIds, ...sample.extraIds]));
    const frequency = new Map();
    for (const id of sampleIds) frequency.set(id, (frequency.get(id) || 0) + 1);
    const mapped = support.representativeIds[name] || parts.map(entry => support.representativeIds[entry.name]).find(Boolean);
    const familyNames = new Set(parts.map(entry => entry.name));
    const candidates = cards.filter(card => familyNames.has(card.archetype));
    const representative = cardsById.get(mapped) || candidates.sort((a, b) =>
      Number(b.type.includes("Monster")) - Number(a.type.includes("Monster"))
      || (frequency.get(b.id) || 0) - (frequency.get(a.id) || 0) || a.id - b.id)[0]
      || sampleIds.map(id => cardsById.get(id)).find(card => card?.archetype && card.type.includes("Monster"));
    const image = representative?.card_images?.[0];
    if (!labels.zh) throw new Error(`Unresolved Chinese trend name: ${name}; keeping the previous catalog`);
    if (!image?.id || !image.image_url_cropped) throw new Error(`No representative artwork for ${name}`);
    entries[support.key(name)] = {
      name, labels, cardId: representative.id, imageId: image.id,
      image: `data/trend-images/${image.id}.jpg`, sourceImage: image.image_url_cropped,
    };
  }
  return { ...catalog, generatedAt: new Date().toISOString(), activeNames: names };
}

export function isImage(buffer) {
  return buffer.length > 1000 && (buffer[0] === 0xff && buffer[1] === 0xd8
    || buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP");
}

export async function syncTrendCatalog({ officialLocale, trends = [] } = {}) {
  const [cards, locales, aliases, decks, power, previous] = await Promise.all([
    readJson(path.join(DATA_DIR, "cardinfo-cache.json")), readJson(path.join(DATA_DIR, "master-duel-locales.json")),
    readJson(path.join(DATA_DIR, "multilang-aliases.json")), readWindowCache(path.join(DATA_DIR, "deck-search-cache.js")),
    readWindowCache(path.join(DATA_DIR, "power-rankings-cache.js")), readJson(path.join(DATA_DIR, "trend-catalog.json")).catch(() => ({})),
  ]);
  const catalog = await buildTrendCatalog({ cards: cards.data, locales, aliases, decks, power, previous, officialLocale, trends });
  const images = new Map(catalog.activeNames.map(name => {
    const entry = support.entryFor(name, catalog);
    return [entry.imageId, entry];
  }));
  await fs.mkdir(path.join(DATA_DIR, "trend-images"), { recursive: true });
  for (const entry of images.values()) {
    const file = path.join(DATA_DIR, "trend-images", `${entry.imageId}.jpg`);
    let buffer = await fs.readFile(file).catch(() => null);
    if (!buffer || !isImage(buffer)) {
      let error;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch(entry.sourceImage, { signal: AbortSignal.timeout(20000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          buffer = Buffer.from(await response.arrayBuffer());
          if (!isImage(buffer)) throw new Error("invalid image response");
          await atomicWrite(file, buffer);
          error = null;
          break;
        } catch (cause) { error = cause; }
      }
      if (error) throw new Error(`Trend image ${entry.imageId}: ${error.message}; keeping the previous catalog`);
    }
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    for (const value of Object.values(catalog.entries)) if (value.imageId === entry.imageId) value.imageHash = hash;
  }
  // Publish the browser bundle only after every name and its local artwork pass.
  await writeJson(path.join(DATA_DIR, "trend-catalog.json"), catalog);
  await writeWindowCache(path.join(DATA_DIR, "trend-catalog.js"), "YGO_TREND_CATALOG", catalog);
  return { localizedNames: catalog.activeNames.length, offlineImages: images.size };
}
