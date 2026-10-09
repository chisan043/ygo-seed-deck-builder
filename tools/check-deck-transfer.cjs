const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const transfer = require("../deck-transfer.js");
const root = path.resolve(__dirname, "..");

const recipe = { main: [89631139, 14558127, 0xffffffff, 3], extra: [38331564], side: [46986414] };
const encoded = transfer.encodeYdke(recipe);
assert(encoded.includes("/") && encoded.includes("="), "Use padded, standard Base64");
assert.deepEqual(transfer.decodeYdke(encoded), recipe);
assert.deepEqual(transfer.decodeYdke("ydke://" + encoded.slice(7).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")), recipe, "Read earlier URL-safe exports");
assert.deepEqual(transfer.parseYdk(transfer.toYdk(recipe)), recipe);
assert.deepEqual(transfer.parseYdk("\uFEFF" + transfer.toYdk(recipe).replace(/\n/g, "\r\n")), recipe);
for (const bad of ["ydke://bad!deck", "ydke://AA==!!!", "ydke://AAAAAA==!!!", "ydke://AQAAAA==!!!garbage", "ydke://AQAAAA$!!!", "ydke://ARAAAA=!!!"]) {
  assert.throws(() => transfer.decodeYdke(bad), /invalidRecipe/);
}
for (const bad of ["random text", "#main\n0", "#main\n-1", "#main\n4294967296", "#main\n3 cards", "#main\n" + "1\n".repeat(301)]) assert.throws(() => transfer.parseYdk(bad));
assert.throws(() => transfer.encodeYdke({ main: [-1] }));
const gameRecipe = { main: Array.from({ length: 40 }, (_, i) => i + 1), extra: [41], side: [] };
assert.deepEqual(transfer.decodeYdke(transfer.encodeYdke(gameRecipe)), gameRecipe);

// Exercise local recipe imports and exports with independent card metadata.
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
function fn(name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `Missing ${name}`);
  const next = source.slice(start + 1).search(/\n(?:async )?function /);
  return source.slice(start, next < 0 ? undefined : start + 1 + next);
}
const cards = new Map([[1, { id: 1, name: "Alpha" }], [2, { id: 2, name: "Extra", extra: true }], [3, { id: 3, name: "Limited", limit: 1 }], [4, { id: 4, name: "Unavailable", unavailable: true }], [101, { id: 1, name: "Alpha" }]]);
const context = vm.createContext({
  YGODeckTransfer: transfer, state: { allCards: [...cards.values()], searchIndex: [], lastDeck: { main: [{ card: cards.get(1), qty: 3 }], extra: [{ card: cards.get(2), qty: 1 }] }, localDeckDraft: { main: [{ id: 101, qty: 3 }], extra: [{ id: 2, qty: 1 }] } },
  cardByLocalId: id => cards.get(Number(id)), isExtraDeck: card => Boolean(card.extra),
  localizedCard: card => card, isCardInFormat: card => !card.unavailable, copyLimit: card => card.limit ?? 3,
  compactNormalize: value => value.toLowerCase().replace(/\s+/g,""), compactSpaces: value => value.trim().replace(/\s+/g, " "), findBestCard: name => [...cards.values()].find(card => card.name === name),
  t: key => key, format: (text, values) => text + JSON.stringify(values),
});
vm.runInContext(["deckRecipe", "deckYdkText", "deckYdkeText", "readRecipeImport", "parseLocalDeckImportLine", "normalizeLocalCardRecords", "findImportCard"].map(fn).join("\n"), context);
const run = expr => JSON.parse(JSON.stringify(vm.runInContext(expr, context)));
assert.deepEqual(run('deckRecipe(state.lastDeck)'), { main: [1, 1, 1], extra: [2], side: [] }, "Builder exports use canonical passcodes");
assert.deepEqual(run('readRecipeImport(deckYdkeText(state.lastDeck))'), { main: [{ id: 1, qty: 3 }], extra: [{ id: 2, qty: 1 }], sideCount: 0, unknown: [] });
assert.deepEqual(run('readRecipeImport("#main\\n1\\n999\\n#extra\\n2\\n!side\\n888")'), { main: [{ id: 1, qty: 1 }], extra: [{ id: 2, qty: 1 }], sideCount: 1, unknown: ["999"] });
assert.deepEqual(run('readRecipeImport("Alpha x4\\nExtra x2")').main, [{ id: 1, qty: 4 }], "Do not silently clamp quantities");
assert.deepEqual(run('readRecipeImport("Alpha\\nunknown name")').unknown, ["unknown name"]);
assert.deepEqual(run('normalizeLocalCardRecords([{id:1,qty:4}])'), [{id:1,qty:4}], "Imported quantities survive save and reload");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert(html.indexOf('src="deck-transfer.js') < html.indexOf('src="app.js'));
assert(JSON.parse(fs.readFileSync(path.join(root, "package.json"))).build.files.includes("deck-transfer.js"));
assert.deepEqual(Object.keys(transfer).sort(), ["decodeYdke", "encodeYdke", "parseYdk", "toYdk"], "The recipe module exposes local codecs only");
for (const id of ["transferBuildDeck", "transferLocalDeck", "buildTransferPanel", "localTransferPanel", "downloadLocalYdk", "copyLocalYdke"]) assert(!html.includes(`id="${id}"`), "Removed game-import and local export entry points stay absent");
assert(!/openRecipeTransfer|officialImportUrl|storm-access=|deck-transfer-for-master-duel/.test(source), "No official game-transfer route remains");
assert(!/从游戏导出到官方数据库|deck-transfer-for-master-duel|storm-access=|data-i18n="transfer/.test(html), "HTML fallback copy cannot restore removed game/extension instructions");
console.log("Local recipe checks passed: YDK/YDKE round trips, legacy codes, malformed data, import preservation, no game-transfer entry points, packaged module.");
