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
  const officialCards = Object.fromEntries(Object.entries(previous.officialCards || {}).map(([id, entry]) => [
    id, entry.name ? { "zh-CN": entry } : { ...entry },
  ]));
  const languages = {
    zh: { locale: "zh-CN", konami: "cn" },
    ja: { locale: "ja-JP", konami: "ja" },
  };
  const aliasById = new Map((aliases.entries || []).map(entry => [Number(entry.id), entry]));
  const families = new Map();
  for (const card of cards) {
    if (!card.archetype) continue;
    if (!families.has(card.archetype)) families.set(card.archetype, []);
    families.get(card.archetype).push(card);
  }
  function localizedNames(family, language, source = "preferred") {
    const { locale } = languages[language];
    return family.map(card => {
      const names = {
        md: locales.cards?.[card.id]?.[locale]?.name,
        official: officialCards[card.id]?.[locale]?.name,
        alias: aliasById.get(card.id)?.texts?.[locale]?.name,
      };
      return source === "preferred" ? names.md || names.official || names.alias : names[source];
    }).filter(name => /[\u3400-\u9fff\u3040-\u30ff]/u.test(name || ""));
  }
  const preferred = Object.fromEntries(Object.entries(languages).map(([language, config]) => [
    language, { ...support.names[language], ...locales.archetypes?.[config.locale] },
  ]));
  const aliasesByName = {};
  for (const name of new Set([...families.keys(), ...Object.keys(preferred.zh), ...Object.keys(preferred.ja)])) {
    const family = families.get(name) || [];
    const labels = {};
    for (const language of Object.keys(languages)) {
      labels[language] = preferred[language][name] || support.inferLabel(localizedNames(family, language), language);
      // A source may use an alternative localized name (e.g. 杀手级调整曲).
      // Resolve it back to the same family before switching UI language.
      for (const label of [labels[language], ...["md", "official", "alias"].map(source => support.inferLabel(localizedNames(family, language, source), language))]) {
        if (label) aliasesByName[support.key(label)] ||= support.key(name);
      }
    }
    entries[support.key(name)] = { name, labels };
  }
  const catalog = { version: 1, entries, aliases: aliasesByName, officialCards };
  const familyCatalog = { entries: Object.fromEntries(Object.entries(entries).filter(([, entry]) => families.has(entry.name))), aliases: aliasesByName };
  const names = activeTrendNames(decks, power, trends);
  // New paper-game families may precede Master Duel. Fetch the existing official
  // Neuron locale service only for families missing from the bundled translations.
  for (const name of names) {
    const parts = support.components(name, familyCatalog);
    for (const entry of parts) for (const [language, config] of Object.entries(languages)) {
      if (entry.labels[language]) continue;
      const family = families.get(entry.name) || [];
      if (officialLocale) for (const card of family.slice(0, 8)) {
        try {
          const official = await officialLocale(card.id, config.konami);
          const text = official?.texts?.[config.locale];
          if (text?.official && /[\u3400-\u9fff\u3040-\u30ff]/u.test(text.name)) {
            officialCards[card.id] = { ...officialCards[card.id], [config.locale]: text };
          }
        } catch { /* A previous verified catalog remains available on source failure. */ }
      }
      entry.labels[language] = support.inferLabel(localizedNames(family, language), language);
    }
  }
  const cardsById = new Map(cards.map(card => [Number(card.id), card]));
  for (const card of cards) for (const image of card.card_images || []) cardsById.set(Number(image.id), card);
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
    for (const [language, label] of Object.entries(labels)) {
      if (!label || support.hasUntranslatedText(label)) throw new Error(`Unresolved ${language === "zh" ? "Chinese" : "Japanese"} trend name: ${name}; keeping the previous catalog`);
    }
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
