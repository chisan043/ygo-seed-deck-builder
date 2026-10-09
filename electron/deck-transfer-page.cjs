// The adapter uses official form identifiers; it is implemented locally and
// never submits the form. Login fields and credentials are not inspected.
function officialPageAction(recipe) {
  if (location.origin !== "https://www.db.yugioh-card.com" || location.pathname !== "/yugiohdb/member_deck.action") return { kind: "login" };
  const operation = new URLSearchParams(location.search).get("ope");
  const officialUrl = value => {
    try {
      const url = new URL(value, location.href);
      return url.origin === location.origin && url.pathname === location.pathname ? url.href : "";
    } catch { return ""; }
  };
  if (operation === "2") {
    if (!document.body.classList.contains("en")) return { kind: "language" };
    const groups = ["monster", "spell", "trap", "extra", "side"];
    const slots = {};
    for (const group of groups) {
      const prefix = group.slice(0, 2);
      slots[group] = [...document.getElementsByName(`${group}CardId`)].map((id, index) => ({
        id, name: document.getElementById(`${prefix}nm_${index + 1}`),
        qty: document.getElementById(`${prefix}num_${index + 1}`),
        image: document.getElementById(`imgs_${prefix}_${index + 1}`),
      }));
      if (!slots[group].length || slots[group].length < recipe.groups[group].length || slots[group].some(slot => !slot.name || !slot.qty || !slot.image)) return { kind: "schema" };
    }
    // Do not overwrite an existing recipe; automatic filling uses a blank deck.
    if (groups.some(group => slots[group].some(slot => slot.name.value.trim() || Number(slot.id.value) > 0))) return { kind: "occupied" };
    const setValue = (node, value) => {
      node.value = String(value);
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
    };
    for (const group of groups) {
      slots[group].forEach((slot, index) => {
        const row = recipe.groups[group][index];
        setValue(slot.name, row?.name || "");
        setValue(slot.qty, row?.qty || "");
        setValue(slot.id, row?.konamiId || "");
        setValue(slot.image, row ? `${row.konamiId}_1_1_1` : "null_null_null_null");
      });
    }
    const deckName = document.querySelector('[name="dnm"]');
    if (deckName) setValue(deckName, recipe.name);
    const correct = groups.every(group => recipe.groups[group].every((row, index) => {
      const slot = slots[group][index];
      return slot.name.value === row.name && Number(slot.qty.value) === row.qty && Number(slot.id.value) === row.konamiId;
    }));
    return { kind: correct ? "filled" : "schema", nameFilled: Boolean(deckName) };
  }
  if (operation === "6") {
    for (const input of document.querySelectorAll("input.link_value")) {
      const href = officialUrl(input.value);
      if (!href) continue;
      const url = new URL(href);
      url.searchParams.set("ope", "2");
      url.searchParams.set("request_locale", "en");
      url.searchParams.delete("ytkn");
      return { kind: "edit", url: url.href };
    }
    return { kind: "schema" };
  }
  if (operation === "4") {
    const candidates = [document.getElementById("deck_recipe")?.nextElementSibling, ...document.querySelectorAll('a[href*="ope=6"]')];
    for (const link of candidates) {
      const href = officialUrl(link?.href);
      if (href && new URL(href).searchParams.get("ope") === "6") return { kind: "create", url: href };
    }
    return { kind: "manual" };
  }
  const link = document.querySelector("a.menu_my_decks");
  if (link) {
    const url = new URL(link.href, location.href);
    if (url.origin === location.origin && /^\/yugiohdb\/member_(?:login|deck)\.action$/.test(url.pathname)) return { kind: "my-decks", url: url.href };
  }
  return { kind: "manual" };
}

module.exports = { officialPageAction };
