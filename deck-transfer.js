(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.YGODeckTransfer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const sections = ["main", "extra", "side"];
  // Keep unfinished/illegal recipes intact for editing; game legality is checked separately.
  const maxCards = 300;
  function fail(code) { throw new Error(code); }
  function checkIds(ids) {
    if (!Array.isArray(ids) || ids.length > maxCards || ids.some(id => !Number.isInteger(id) || id <= 0 || id > 0xffffffff)) fail("invalidRecipe");
    return ids;
  }
  function encodeSection(ids) {
    checkIds(ids);
    const bytes = new Uint8Array(ids.length * 4);
    const view = new DataView(bytes.buffer);
    ids.forEach((id, index) => view.setUint32(index * 4, id, true));
    return btoa(String.fromCharCode(...bytes));
  }
  function decodeSection(text) {
    // Accept the app's older URL-safe exports, but always emit standard Base64.
    const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
    if (text.length > maxCards * 8 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) fail("invalidRecipe");
    let binary;
    try { binary = atob(normalized); } catch { fail("invalidRecipe"); }
    if (binary.length % 4 || binary.length / 4 > maxCards) fail("invalidRecipe");
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    const ids = Array.from({ length: bytes.length / 4 }, (_, index) => view.getUint32(index * 4, true));
    checkIds(ids);
    if (encodeSection(ids).replace(/=+$/, "") !== normalized.replace(/=+$/, "")) fail("invalidRecipe");
    return ids;
  }
  function encodeYdke(recipe) {
    return `ydke://${sections.map(section => encodeSection(recipe[section] || [])).join("!")}!`;
  }
  function decodeYdke(raw) {
    const match = String(raw).trim().match(/^ydke:\/\/([^!]*)!([^!]*)!([^!]*)!$/i);
    if (!match) fail("invalidRecipe");
    return Object.fromEntries(sections.map((section, index) => [section, decodeSection(match[index + 1])]));
  }
  function parseYdk(raw) {
    const recipe = { main: [], extra: [], side: [] };
    let section = "";
    for (const value of String(raw).replace(/^\uFEFF/, "").split(/\r?\n/)) {
      const line = value.trim();
      if (!line) continue;
      const marker = line.match(/^(?:#(main|extra)|!(side))$/i);
      if (marker) { section = (marker[1] || marker[2]).toLowerCase(); continue; }
      if (line.startsWith("#") || line.startsWith("//")) continue;
      if (!section || !/^\d+$/.test(line)) fail("invalidRecipe");
      recipe[section].push(Number(line));
      checkIds(recipe[section]);
    }
    if (!section) fail("invalidRecipe");
    return recipe;
  }
  function toYdk(recipe) {
    sections.forEach(section => checkIds(recipe[section] || []));
    return ["#created by Seed Deck Builder", "#main", ...(recipe.main || []), "#extra", ...(recipe.extra || []), "!side", ...(recipe.side || [])].join("\n");
  }
  function officialImportUrl(recipe) {
    // Public extension protocol; no account credentials or official database card IDs.
    return "https://www.db.yugioh-card.com/yugiohdb/member_deck.action?request_locale=en#storm-access=" + encodeURIComponent(encodeYdke(recipe).slice(7));
  }
  return { encodeYdke, decodeYdke, parseYdk, toYdk, officialImportUrl };
});
