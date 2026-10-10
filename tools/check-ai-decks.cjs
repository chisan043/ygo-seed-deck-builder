const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ai = require("../ai-deck.js");
const { cleanConfig, runAi, createAiManager } = require("../electron/ai-client.cjs");

async function main() {
  assert.equal(ai.endpoint("https://example.com/v1/"), "https://example.com/v1/chat/completions");
  assert.equal(ai.endpoint("http://127.0.0.1:1234/v1/chat/completions"), "http://127.0.0.1:1234/v1/chat/completions");
  for (const url of ["file:///tmp/key", "http://example.com/v1", "https://key@example.com", "https://example.com?key=secret", "https://example.com/#key"]) assert.throws(() => ai.endpoint(url));
  assert.throws(() => cleanConfig({ baseUrl: "https://example.com", model: "" }), /aiModelError/);
  const cards = Array.from({ length: 15 }, (_, i) => ({ id: i + 1, limit: i === 14 ? 1 : 3, extra: false, text: "Known card effect", name: `Card ${i}` }));
  cards.push({ id: 99, limit: 1, extra: true });
  const context = { cards, seedId: 1, format: "md", language: "Chinese", requirements: "Theme focused", samples: [] };
  const recipe = { title: "Test", strategy: "Use supplied effects", main: cards.slice(0, 13).map(card => ({ id: card.id, qty: 3 })), extra: [{ id: 99, qty: 1 }] };
  recipe.main.push({ id: 15, qty: 1 });
  assert(ai.validate(JSON.stringify(recipe), context).recipe);
  assert(ai.validate('```json\n' + JSON.stringify(recipe) + '\n```', context).recipe);
  function invalid(change) { const copy = structuredClone(recipe); change(copy); assert(ai.validate(JSON.stringify(copy), context).issues.length); }
  invalid(r => r.main[0].id = 777); // Hallucinated card
  invalid(r => r.main.push({ id: 15, qty: 1 })); // Aggregate limits cannot hide duplicate rows
  invalid(r => r.main[13].qty = 2); // Current format restriction
  invalid(r => r.main[0].qty = 1.5);
  invalid(r => r.main[0].qty = "3");
  invalid(r => r.main[0].id = 99); // Misplaced Extra Deck card
  invalid(r => r.main.shift()); // Missing seed and short deck
  invalid(r => r.extra = [{ id: 99, qty: 16 }]);
  assert(ai.validate('{"main":[],"extra":[]}', context).issues.length);
  assert(ai.validate("I can't build this", context).issues.length);
  assert(ai.validate('{"main":[null],"extra":[]}', context).issues.length);
  assert(ai.validate(JSON.stringify(recipe), { ...context, cards: cards.map(card => ({ ...card, limit: card.id === 1 ? 0 : card.limit })) }).issues.length, "A newly forbidden seed is rejected");
  const config = { baseUrl: "https://example.com/v1", model: "my-model", apiKey: "test-secret", enabled: true, systemPrompt: "Custom prompt: prioritize coherent theme combos." };
  const requests = [];
  const fake = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    assert.equal(url, "https://example.com/v1/chat/completions");
    assert.equal(options.headers.authorization, "Bearer test-secret");
    assert.equal(options.redirect, "error", "Keys must not follow redirects to a different host");
    const result = requests.length === 1 ? { ...recipe, main: [] } : recipe;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }));
  };
  const result = await runAi(config, { context }, { fetch: fake });
  assert(result.ok && result.repaired);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].model, "my-model");
  assert(requests[0].messages[0].content.startsWith(config.systemPrompt), "Saved custom instructions reach the provider");
  assert(requests[0].messages[0].content.includes(ai.OUTPUT_RULES), "Output schema is appended even with a custom prompt");
  assert(ai.messages(context)[0].content.startsWith(ai.DEFAULT_SYSTEM_PROMPT), "Existing settings migrate to the visible default");
  assert.throws(() => ai.normalizePrompt(" "), /aiPromptError/);
  assert.throws(() => ai.normalizePrompt("x".repeat(12001)), /aiPromptError/);
  assert(requests[0].messages[1].content.includes("Theme focused"));
  assert.equal(requests[1].messages.length, 4);
  const planningContext = { format: "md", language: "Chinese", requirements: "后手烧血高抗性卡组", buildCount: 3, themes: [
    { seedId: 1, archetype: "Theme A" }, { seedId: 2, archetype: "Theme B" }, { seedId: 3, archetype: "Theme C" },
  ] };
  const plans = planningContext.themes.map(theme => ({ seedId: theme.seedId, title: theme.archetype, direction: "Burn with defensive tools" }));
  assert.equal(ai.validatePlan(JSON.stringify({ plans }), planningContext).issues.length, 0);
  assert(ai.validatePlan(JSON.stringify({ plans: [plans[0], plans[0], plans[2]] }), planningContext).issues.length, "Directions must use different themes");
  assert(ai.validatePlan(JSON.stringify({ plans: [...plans.slice(0, 2), { ...plans[2], seedId: 999 }] }), planningContext).issues.length, "The planner cannot invent seeds");
  let planCalls = 0;
  const planned = await runAi(config, { task: "plan", context: planningContext }, { fetch: async (_url, options) => {
    planCalls += 1;
    const body = JSON.parse(options.body);
    assert(body.messages[0].content.includes(ai.PLAN_RULES));
    assert(body.messages[0].content.startsWith(config.systemPrompt), "Custom prompt also applies to theme selection");
    assert(body.messages[1].content.includes(planningContext.requirements));
    const output = planCalls === 1 ? { plans: [plans[0], plans[0], plans[2]] } : { plans };
    return Response.json({ choices: [{ message: { content: JSON.stringify(output) } }] });
  } });
  assert.equal(planned.plans.length, 3);
  assert.equal(planCalls, 2, "The planner gets one bounded correction");
  let invalidPlanCalls = 0;
  await assert.rejects(runAi(config, { task: "plan", context: planningContext }, { fetch: async () => {
    invalidPlanCalls += 1;
    return Response.json({ choices: [{ message: { content: '{"plans":[]}' } }] });
  } }), /aiPlanError/);
  assert.equal(invalidPlanCalls, 2);
  await assert.rejects(runAi(config, { task: "plan", context: { ...planningContext, buildCount: 100 } }, { fetch: fake }), /aiContextError/);
  let badRequests = 0;
  await assert.rejects(runAi(config, { context }, { fetch: async () => { badRequests++; return new Response(JSON.stringify({ choices: [{ message: { content: "invalid" } }] })); } }), /aiRecipeError/);
  assert.equal(badRequests, 2, "Only one paid correction is allowed");
  await assert.rejects(runAi(config, { context }, { fetch: async () => new Response('secret provider body', { status: 401 }) }), /aiHttpError:401/);
  await assert.rejects(runAi(config, { test: true }, { fetch: async () => { throw new Error('network test-secret'); } }), error => error.message === "aiNetworkError");
  await assert.rejects(runAi(config, { test: true }, { fetch: async () => new Response('{}') }), /aiResponseError/);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(runAi(config, { test: true }, { signal: aborted.signal, fetch: async () => { throw new Error('aborted'); } }), /aiCancelled/);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ygo-ai-test-"));
  try {
    const vault = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value.split('').reverse().join('')), decryptString: value => value.toString().split('').reverse().join('') };
    const manager = createAiManager({ directory, safeStorage: vault, fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] })) });
    assert.equal(manager.savePrompt("Personal prompt before configuring an API").systemPrompt, "Personal prompt before configuring an API");
    const saved = manager.saveConfig({ ...config, rememberKey: true });
    assert(saved.hasKey && saved.keyStored);
    assert.equal(saved.storagePath, path.join(directory, "ai-settings.json"), "The displayed storage path matches the actual encrypted settings file");
    assert.equal(saved.systemPrompt, "Personal prompt before configuring an API", "Saving connection settings preserves the prompt");
    assert(manager.savePrompt("Updated personal prompt").hasKey, "Prompt changes preserve the secret");
    assert.throws(() => manager.savePrompt(""), /aiPromptError/);
    assert(!JSON.stringify(saved).includes("test-secret"));
    assert(!fs.readFileSync(path.join(directory, "ai-settings.json"), "utf8").includes("test-secret"));
    const reopened = createAiManager({ directory, safeStorage: vault });
    assert(reopened.getConfig().hasKey);
    assert.equal(reopened.getConfig().systemPrompt, "Updated personal prompt", "Prompt survives restart");
    assert(manager.saveConfig({ ...config, apiKey: "", rememberKey: true }).hasKey, "Blank preserves a key on the same endpoint");
    assert(!manager.saveConfig({ ...config, baseUrl: "https://other.example/v1", apiKey: "", rememberKey: true }).hasKey, "Changing providers never sends the previous provider's key");
    manager.saveConfig({ ...config, rememberKey: false });
    assert(!JSON.parse(fs.readFileSync(path.join(directory, "ai-settings.json"))).encryptedKey);
    assert(!manager.forgetKey().hasKey);
    const cancellable = createAiManager({ directory, safeStorage: vault, fetch: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("Abort network")), { once: true });
    }) });
    cancellable.saveConfig({ ...config, rememberKey: false });
    const pending = cancellable.request({ test: true, config: { ...config, apiKey: "" } });
    await assert.rejects(cancellable.request({ test: true, config }), /aiBusy/);
    cancellable.cancel();
    await assert.rejects(pending, /aiCancelled/, "Cancellation releases the in-flight request");
    const unsafe = createAiManager({ directory, safeStorage: { ...vault, getSelectedStorageBackend: () => "basic_text" } });
    assert(!unsafe.saveConfig({ ...config, rememberKey: true }).keyStored, "No weak plaintext-backed persistence");
    assert(!fs.readFileSync(path.join(directory, "ai-settings.json"), "utf8").includes("test-secret"));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  const vm = require("node:vm");
  const bridges = {};
  const invocations = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "electron/preload.cjs"), "utf8"), {
    require: () => ({ contextBridge: { exposeInMainWorld: (name, value) => { bridges[name] = value; } }, ipcRenderer: { invoke: (channel, payload) => { invocations.push({ channel, payload }); return Promise.resolve({ ok: true }); } } }),
  });
  assert(bridges.desktopAI && bridges.desktopUpdates, "AI bridge coexists with the updater");
  await bridges.desktopAI.request({ test: true });
  assert.equal(invocations[0].channel, "ai:request");
  assert.equal(invocations[0].payload.test, true);
  assert.deepEqual(Object.keys(bridges.desktopAI).sort(), ["cancel", "forgetKey", "getConfig", "request", "saveConfig", "savePrompt"], "Only scoped IPC methods are exposed");

  await bridges.desktopAI.savePrompt("A personal prompt");
  assert.equal(invocations[1].channel, "ai:save-prompt");
  assert.equal(invocations[1].payload, "A personal prompt");

  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert(html.indexOf('data-page="banlist"') < html.indexOf('data-page="ai-settings"'), "Settings tab follows Banlist");
  assert(html.includes('id="aiModeHint" role="status" aria-live="polite"'), "Generation state must be announced");
  assert(html.indexOf('src="ai-deck.js') < html.indexOf('src="app.js'), "Load shared AI codec first");
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const choiceSource = source.slice(source.indexOf("function buildDeckChoices("), source.indexOf("function publicSampleAgeDays("));
  const configuredSource = source.slice(source.indexOf("async function buildConfiguredDeckChoices("), source.indexOf("aiSettingsReady = setupAiSettings();"));
  const scope = {
    aiSettingsReady: Promise.resolve(), aiConfig: { enabled: false }, aiController: null, browserAiKey: "", aiLastError: "", aiRequestStatus: "",
    AbortController, YGOAiDeck: ai, t: key => key, format: (text, values) => `${text}:${JSON.stringify(values)}`, renderAiSettingsState: () => {},
    buildDeckFromPublicSample: (_seed, sample) => sample.invalid ? null : ({ ...sample, variantKind: "public" }),
    buildAiDecks: () => { throw new Error("Unexpected heuristic fallback"); },
    state: { activeFormat: "md", cardByAnyId: new Map(cards.map(card => [card.id, card])) },
    modelDeckContext: () => context,
    isCardInFormat: () => true, copyLimit: card => card.limit,
    estimateScore: () => 80, simulateOpeningHands: () => ({}), setAiRequestBusy: () => {},
    aiErrorText: error => error.message,
    requestAi: async () => { throw new Error("Unexpected model request"); },
  };
  vm.createContext(scope);
  const sampleAgeSource = source.match(/function publicSampleAgeDays\([^)]*\) \{[\s\S]*?\n\}/)[0];
  const samplePolicySource = ["RECENT_PUBLIC_DECK_DAYS", "MIN_PUBLIC_DECK_CHOICES"].map(name => source.match(new RegExp(`^const ${name} = .*;$`, "m"))[0]).join("\n");
  scope.Date = class extends Date { static now() { return Date.parse("2026-10-10T00:00:00Z"); } };
  vm.runInContext(samplePolicySource + sampleAgeSource + choiceSource + configuredSource, scope);
  const sampleAt = (id, days, invalid = false) => ({ id, invalid, date: new Date(scope.Date.now() - days * 86400000).toISOString() });
  const recentSamples = Array.from({ length: 4 }, (_, i) => sampleAt(`recent-${i}`, i));
  const history = Array.from({ length: 25 }, (_, i) => sampleAt(`older-${i}`, i + 8));
  const chooseIds = samples => Array.from(scope.buildDeckChoices(cards[0], "competitive", samples), deck => deck.id);
  assert.deepEqual(chooseIds([...history].reverse().concat(recentSamples)), [
    ...recentSamples.map(sample => sample.id), ...history.slice(0, 11).map(sample => sample.id),
  ], "Four recent results are topped up with the eleven newest older matches");
  const manyRecent = Array.from({ length: 20 }, (_, i) => sampleAt(`many-${i}`, i / 3));
  assert.deepEqual(chooseIds(history.concat([...manyRecent].reverse())), manyRecent.map(sample => sample.id), "Keep all twenty recent matches, with no history or fifteen-result cap");
  const fifteenRecent = Array.from({ length: 15 }, (_, i) => sampleAt(`enough-${i}`, i / 2));
  assert.deepEqual(chooseIds(history.concat(fifteenRecent)), fifteenRecent.map(sample => sample.id), "Exactly fifteen recent matches need no history; the seven-day boundary is included");
  assert.deepEqual(chooseIds([...history].reverse()), history.slice(0, 15).map(sample => sample.id), "No recent results selects the fifteen newest older matches");
  assert.deepEqual(chooseIds([sampleAt("old", 20), sampleAt("recent", 1)]), ["recent", "old"], "Insufficient history returns real counts without fabricating samples");
  assert.deepEqual(chooseIds([]), []);
  const invalidRecent = Array.from({ length: 12 }, (_, i) => sampleAt(`invalid-${i}`, i / 3, true));
  const invalidOlder = sampleAt("unusable-old", 7.5, true);
  assert.equal(chooseIds([...recentSamples, ...invalidRecent, invalidOlder, ...history]).length, 15, "Discarded recipes must not prevent topping up usable results");
  assert.equal(chooseIds([{ id: "undated" }, sampleAt("dated", 30)])[0], "dated", "Undated samples stay behind dated history");
  const sampleChoices = await scope.buildConfiguredDeckChoices(cards[0], "competitive", [{ title: "Real recipe" }]);
  assert.equal(sampleChoices.length, 1);
  assert.equal(sampleChoices[0].variantKind, "public", "Sample mode contains only real recipes and never calls the model");
  await assert.rejects(scope.buildConfiguredDeckChoices(cards[0], "competitive", []), /aiNoSamples/);
  await assert.rejects(scope.buildConfiguredDeckChoices(cards[0], "ai", []), /aiModeLocal/, "Unconfigured model mode never becomes a heuristic build");
  scope.aiConfig = { enabled: true, baseUrl: config.baseUrl, model: config.model };
  let receivedRequirements;
  scope.modelDeckContext = (_seed, _samples, _archetype, requirements) => { receivedRequirements = requirements; return { ...context, requirements }; };
  scope.requestAi = async ({ context: sent }) => {
    assert.equal(sent.requirements, receivedRequirements);
    return { recipe, model: "Mock model" };
  };
  const modelChoices = await scope.buildConfiguredDeckChoices(cards[0], "ai", [{ title: "Real recipe" }], "", "围绕青眼，优先后攻，少带手坑");
  assert.equal(receivedRequirements, "围绕青眼，优先后攻，少带手坑", "The single input is sent intact to the provider");
  assert.equal(modelChoices.length, 1, "Model mode does not append heuristic or public results");
  assert.equal(modelChoices[0].modelGeneration.model, "Mock model");
  scope.requestAi = async () => { throw new Error("aiNetworkError"); };
  await assert.rejects(scope.buildConfiguredDeckChoices(cards[0], "ai", []), /aiNetworkError/, "Model failure stays an error instead of substituting another mode");
  scope.requestAi = async () => ({ recipe: {}, model: "Mock model" });
  await assert.rejects(scope.buildConfiguredDeckChoices(cards[0], "ai", []), /aiRecipeError/);
  assert.equal(scope.aiController, null, "Requests release their busy state after errors");
  scope.modelStrategyContext = () => planningContext;
  scope.searchPublicDecksForArchetype = async () => [];
  scope.modelDeckContext = (seed, _samples, archetype, requirements) => ({ ...context, seedId: seed.id, archetype, requirements });
  const strategyCalls = [];
  scope.requestAi = async payload => {
    strategyCalls.push(payload);
    return payload.task === "plan" ? { plans, model: "Mock model" } : { recipe: { ...recipe, title: payload.context.archetype }, model: "Mock model" };
  };
  const explored = await scope.buildStrategyDeckChoices(planningContext.requirements);
  assert.equal(strategyCalls.length, 4, "One planning call plus three builds, with no hidden extra calls");
  assert.equal(new Set(explored.map(deck => deck.variantId)).size, 3);
  assert.equal(new Set(explored.map(deck => deck.archetype)).size, 3);
  assert(strategyCalls.every(payload => payload.context.requirements === planningContext.requirements), "Each request preserves the entire strategy");
  assert(explored.every(deck => deck.modelGeneration.strategyRequest));
  scope.requestAi = async payload => {
    if (payload.task === "plan") return { plans };
    if (payload.context.seedId === 2) throw new Error("aiRecipeError");
    return { recipe, model: "Mock model" };
  };
  const partial = await scope.buildStrategyDeckChoices(planningContext.requirements);
  assert.equal(partial.length, 2, "Invalid recipes never appear among valid alternatives");
  assert(partial.every(deck => deck.modelGeneration.strategyFailures === 1), "Partial results carry an honest skipped count");
  scope.requestAi = async () => { scope.aiController.abort(); return { plans }; };
  await assert.rejects(scope.buildStrategyDeckChoices(planningContext.requirements), /aiCancelled/);
  assert.equal(scope.aiController, null);
  assert.equal(scope.aiRequestStatus, "");
  scope.aiConfig.enabled = false;
  await assert.rejects(scope.buildStrategyDeckChoices(planningContext.requirements), /aiModeLocal/);
  const blueEyes = { id: 89631139, name: "Blue-Eyes White Dragon", archetype: "Blue-Eyes" };
  const ash = { id: 14558127, name: "Ash Blossom & Joyous Spring" };
  const castle = { id: 72283691, name: "Golden Castle of Stromberg", archetype: "Golden Castle of Stromberg" };
  const lord = { id: 95440946, name: "Eldlich the Golden Lord", archetype: "Eldlich" };
  const inputScope = {
    YGODeckAliases: require("../deck-aliases.js"),
    normalize: value => String(value || "").normalize("NFKC").toLowerCase().replace(/[’']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim(),
    compactNormalize: value => inputScope.normalize(value).replace(/\s+/g, ""),
    deckSearchCandidates: () => new Map([["青眼", "Blue-Eyes"], ["blue eyes", "Blue-Eyes"], ["ブルーアイズ", "Blue-Eyes"], ["耀圣", "Elfnote"], ["sky striker", "Sky Striker"], ["黄金国", "Eldlich"], ["黃金國", "Eldlich"], ["エルドリッチ", "Eldlich"]]),
    localizeTrendName: name => name, t: key => key,
    state: { cardByAnyId: new Map([blueEyes, ash, castle, lord].map(card => [card.id, card])), searchIndex: [
      { label: "青眼白龙", card: blueEyes }, { label: blueEyes.name, card: blueEyes },
      { label: "灰流丽", card: ash }, { label: "灰流うらら", card: ash }, { label: ash.name, card: ash },
    ] },
  };
  vm.createContext(inputScope);
  vm.runInContext(source.slice(source.indexOf("const cardSearchAliases ="), source.indexOf("const starterHints =")) +
    source.slice(source.indexOf("function buildSearchIndex("), source.indexOf("function findBestCard(")), inputScope);
  const castleAliases = { entries: [{ id: castle.id, names: [{ lang: "zh-CN", name: "急流山的金宫" }, { lang: "ja-JP", name: "シュトロームベルクの金の城" }] }] };
  const castleLocales = { cards: { [castle.id]: { "zh-CN": { name: "急流山的金宫" } } }, searchEntries: [] };
  inputScope.state.searchIndex.push(...inputScope.buildSearchIndex([castle], castleAliases, castleLocales));
  inputScope.state.searchIndex.push(...inputScope.buildSearchIndex([lord], { entries: [] }, { searchEntries: [{ id: lord.id, names: [{ lang: "md-zh-CN", name: "黄金卿埃尔德里奇" }] }] }));
  vm.runInContext(source.slice(source.indexOf("function findModelInputMentions("), source.indexOf("function resolveDeckSearchQuery(")), inputScope);
  for (const name of ["金宫", "金宮", "急流山的金宫", "Golden Castle of Stromberg", "シュトロームベルクの金の城"]) {
    assert.equal(inputScope.resolveModelInput(`围绕${name}，后手烧血高抗性卡组`).seed.id, castle.id, "Nicknames and official names resolve to the same specific card");
  }
  assert.equal(inputScope.resolveModelInput("围绕黄金城，加入灰流丽").choices.length, 2, "A later tech card must not guess an ambiguous theme");
  assert.equal(inputScope.resolveModelInput("围绕黄金城，主怪兽是黄金卿埃尔德里奇").seed.id, lord.id, "An explicitly named core resolves the ambiguity");
  assert.equal(inputScope.resolveModelInput("围绕黄金城，后手烧血", "pick:deck:Eldlich").deckQuery.name, "Eldlich");
  assert.equal(inputScope.resolveModelInput("围绕黃金城，後攻", "pick:card:72283691").seed.id, castle.id);
  assert.equal(inputScope.resolveModelInput("围绕黄金国，后手烧血").deckQuery.name, "Eldlich");
  assert.equal(inputScope.buildSearchIndex([], castleAliases, castleLocales).length, 0, "Nicknames cannot introduce missing cards");
  assert(inputScope.buildSearchIndex([castle], { entries: [] }, {}).some(entry => entry.label === "黄金城"), "Nicknames survive refreshed or missing language data");
  vm.runInContext(source.slice(source.indexOf("function findBestCard("), source.indexOf("function deckSearchCandidates(")) +
    source.slice(source.indexOf("function sharedTokenScore("), source.indexOf("function normalize(value)")), inputScope);
  const mentionIndex = inputScope.state.searchIndex;
  inputScope.state.searchIndex = inputScope.buildSearchIndex([castle], castleAliases, castleLocales);
  assert.equal(inputScope.findBestCard("黄金城").id, castle.id, "Ordinary card search uses the same nickname index");
  inputScope.state.searchIndex = mentionIndex;
  assert.equal(inputScope.resolveModelInput("围绕青眼，优先后攻，加入灰流丽").deckQuery.name, "Blue-Eyes", "Later tech cards do not replace the primary theme");
  assert.equal(inputScope.resolveModelInput("围绕耀圣，少带手坑").deckQuery.name, "Elfnote");
  assert.equal(inputScope.resolveModelInput("青眼白龙，优先后攻").seed.id, blueEyes.id, "A full card name takes precedence over its shorter theme");
  assert.equal(inputScope.resolveModelInput("Build around Blue-Eyes White Dragon, going second").seed.id, blueEyes.id);
  assert.equal(inputScope.resolveModelInput("ブルーアイズを中心に、手札誘発は少なめ").deckQuery.name, "Blue-Eyes");
  assert.equal(inputScope.resolveModelInput("灰流うららを使うデッキ").seed.id, ash.id);
  assert.equal(inputScope.resolveModelInput("fewer hand traps, going second").strategyOnly, true);
  assert.equal(inputScope.resolveModelInput("sky strikership going second").strategyOnly, true, "Word boundaries prevent guessing a theme");
  vm.runInContext(source.slice(source.indexOf("function lookupDeckAliases("), source.indexOf("async function renderAliasLookup(")), inputScope);
  assert(inputScope.lookupDeckAliases("黄金城").some(row => row.archetype === "Eldlich" && row.confusable), "Alias lookup explains the confusable theme without claiming it is a true alias");
  assert(inputScope.lookupDeckAliases("黄金国").some(row => row.archetype === "Eldlich"));

  const aliasCatalog = inputScope.YGODeckAliases;
  assert(aliasCatalog.records.length >= 100, "The shared catalogue retains old themes and broadens coverage");
  const compiled = aliasCatalog.compile([
    { archetype: "A", aliases: ["P.K."] }, { archetype: "B", aliases: ["ＰＫ"] },
  ], {});
  assert.deepEqual(compiled.ambiguousAliases.pk.map(target => target.archetype), ["A", "B"], "Future normalized collisions must retain both meanings");
  const oldCandidates = inputScope.deckSearchCandidates;
  inputScope.deckSearchCandidates = () => new Map(aliasCatalog.records.flatMap(record => record.aliases.map(alias => [alias, record.archetype])));
  const nicknameCards = [
    { id: 13171876, name: "Laundry Dragonmaid", archetype: "Dragonmaid" },
    { id: 76145933, name: "Spright Blue", archetype: "Spright" },
    { id: 74078255, name: "Tearlaments Merrli", archetype: "Tearlaments" },
    { id: 9674034, name: "Snake-Eye Ash", archetype: "Snake-Eye" },
    { id: 55725117, name: "Prank-Kids Dropsies", archetype: "Prank-Kids" },
    { id: 37818794, name: "Red-Eyes Dark Dragoon", archetype: "Red-Eyes" },
    { id: 63436931, name: "Crimson Dragon" },
    { id: 73810864, name: "Live☆Twin Lil-la", archetype: "Live☆Twin" },
    { id: 36326160, name: "Live☆Twin Ki-sikil", archetype: "Live☆Twin" },
    { id: 75922381, name: "Spright Red", archetype: "Spright" },
    { id: 70095154, name: "Cyber Dragon", archetype: "Cyber Dragon" },
    { id: 41230939, name: "Cyberdark Horn", archetype: "Cyberdark" },
  ];
  for (const card of nicknameCards) inputScope.state.cardByAnyId.set(card.id, card);
  inputScope.state.searchIndex.push(...inputScope.buildSearchIndex(nicknameCards, { entries: [] }, {}));
  for (const [nickname, theme] of [["旅鸟", "Floowandereeze"], ["雷精", "Spright"], ["白银", "Labrynth"], ["电脑界", "Virtual World"], ["PK", "Phantom Knights"], ["RR", "Raidraptor"], ["SR", "Speedroid"], ["LL", "Lyrilusc"], ["朋克", "P.U.N.K."], ["弹丸", "Rokket"], ["双子", "Live☆Twin"], ["白森", "White Forest"], ["寿司", "Gunkan"]]) {
    assert.equal(inputScope.resolveModelInput(`围绕${nickname}，优先后攻`).deckQuery.name, theme);
  }
  assert.equal(inputScope.resolveModelInput("Build around PK, going second").deckQuery.name, "Phantom Knights");
  assert.equal(inputScope.resolveModelInput("pk").deckQuery.name, "Phantom Knights");
  assert.equal(inputScope.resolveModelInput("sparking resilience").strategyOnly, true, "Acronyms cannot match inside longer English words");
  for (const ambiguous of ["机巧", "機巧", "电子流", "水产", "魔导", "龙骑兵", "红龙"]) {
    assert.equal(inputScope.resolveModelInput(`围绕${ambiguous}，后攻`).choices.length, 2, `${ambiguous} must offer two interpretations`);
  }
  assert.equal(inputScope.resolveModelInput("围绕小蓝，后攻").choices.length, 6);
  assert.equal(inputScope.resolveModelInput("小蓝，龙女仆，后攻").seed.id, 13171876, "An explicit theme resolves shared card nicknames");
  assert.equal(inputScope.resolveModelInput("小蓝，雷精，加入灰流丽").seed.id, 76145933);
  assert.equal(inputScope.resolveModelInput("小蓝，加入灰流丽").choices.length, 6, "Unrelated tech cards must not resolve shared nicknames");
  assert.equal(inputScope.resolveModelInput("小蓝，双子，后攻").seed.id, 73810864);
  assert.equal(inputScope.resolveModelInput("小红，后攻").choices.length, 2);
  assert.equal(inputScope.resolveModelInput("小红，雷精，后攻").seed.id, 75922381);
  assert.equal(inputScope.resolveModelInput("红龙，加入灰流丽").choices.length, 2, "Cards without an archetype cannot match each other through missing fields");
  assert.equal(inputScope.resolveModelInput("龙骑兵团，后攻").deckQuery.name, "Dragunity", "Full theme names outrank shorter confusable prefixes");
  assert.equal(inputScope.resolveModelInput("电子暗黑，后攻").deckQuery.name, "Cyberdark");
  assert.equal(inputScope.resolveModelInput("小蓝", "pick:card:76145933").seed.id, 76145933);
  const karakuriRows = inputScope.lookupDeckAliases("机巧");
  assert(karakuriRows.some(row => row.archetype === "Karakuri" && row.aliases.includes("机巧")));
  assert(karakuriRows.some(row => row.archetype === "Gizmek" && row.aliases.includes("机巧")), "Alias lookup retains both owners of a shared name");
  assert.equal(inputScope.lookupDeckAliases("小蓝").filter(row => row.card).length, 6);
  assert(!inputScope.lookupDeckAliases("龙骑兵团").some(row => row.confusable), "A full theme name must not inherit its ambiguous prefix warning");
  assert(html.indexOf('src="deck-aliases.js') < html.indexOf('src="app.js'), "Static file mode loads the shared aliases before application code");
  assert(JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8")).build.files.includes("deck-aliases.js"), "Native packages must include the shared aliases");
  let choicesLocalized = false;
  let renderedChoiceCount = 0;
  const choiceScope = {
    ...inputScope, ambiguousInputAliases: aliasCatalog.ambiguousAliases, deckSearchCoreIds: aliasCatalog.coreIds,
    setBusy() {}, clearError() {}, clearSearchChoices() {}, setStatus() {},
    loadAllCards: async () => {}, loadLimitRegulation: async () => {}, ensureMetaSamplesForSearch: async () => {},
    ensureLocaleDataForCards: async cards => {
      assert.deepEqual(Array.from(cards, card => card.id), [70095154, 41230939]);
      await Promise.resolve(); choicesLocalized = true;
    },
    renderModelInputChoices: (query, choices) => {
      assert(choicesLocalized, "Ambiguity labels wait for the selected-language card names");
      renderedChoiceCount = choices.length;
    },
    buildConfiguredDeckChoices: () => assert.fail("Ambiguous input cannot call a model before the user chooses"),
    loadBuildsForArchetype: () => assert.fail("Ambiguous input cannot start a build before the user chooses"),
    resetBuilderResults() {}, showError: message => assert.fail(message),
  };
  vm.createContext(choiceScope);
  vm.runInContext(source.slice(source.indexOf("async function runSearch("), source.indexOf("function shouldShowSearchChoices(")), choiceScope);
  await choiceScope.runSearch("电子流", "ai");
  assert.equal(renderedChoiceCount, 2);
  inputScope.deckSearchCandidates = oldCandidates;

  const labels = { state: { language: "zh", activeFormat: "md", inferredArchetypeLocales: { zh: { Eldlich: "埃尔德里" }, ja: { Eldlich: "古い訳名" } } }, trendNameMaps: require("../trend-support.js").names, deckSearchCoreIds: { Eldlich: lord.id } };
  vm.createContext(labels);
  vm.runInContext(source.slice(source.indexOf("function localizeArchetype("), source.indexOf("function localizedEngineList(")), labels);
  assert.equal(labels.localizeTrendName("Eldlich"), "黄金国", "Known deck names override stale inferred card prefixes");
  assert.equal(labels.localizeArchetype("Eldlich"), "黄金国");
  labels.state.language = "ja";
  assert.equal(labels.localizeTrendName("Eldlich"), "エルドリッチ");

  const submissions = [];
  const errors = [];
  const ambiguities = [];
  const strategySubmissions = [];
  Object.assign(inputScope, {
    loadAllCards: async () => {}, loadLimitRegulation: async () => {}, ensureMetaSamplesForSearch: async () => {},
    setBusy: () => {}, clearError: () => {}, clearSearchChoices: () => {}, setStatus: () => {},
    resolveDeckSearchQuery: query => query === "青眼" ? { name: "Blue-Eyes", label: "青眼" } : null,
    findBestCard: () => blueEyes, shouldShowSearchChoices: () => false,
    ensureLocaleDataForCards: async () => {}, ensureLocaleDataForDecks: async () => {},
    searchPublicDecksForSeed: async () => [], searchPublicDecksForArchetype: async () => [],
    representativeSeedForArchetype: archetype => archetype === "Eldlich" ? lord : blueEyes,
    isCardInFormat: () => true, copyLimit: () => 3,
    buildConfiguredDeckChoices: async (seed, style, samples, archetype, requirements) => { submissions.push({ seed, style, archetype, requirements }); return [{}]; },
    renderModelInputChoices: (query, choices) => ambiguities.push({ query, choices }),
    buildStrategyDeckChoices: async requirements => { strategySubmissions.push(requirements); return [{ seed: blueEyes }, { seed: lord }, { seed: castle }]; },
    renderFocusCard: () => {}, renderBuildListView: () => {}, reason: () => "", resetBuilderResults: () => {},
    showError: error => errors.push(error), localStorage: { setItem: () => {} },
    els: { input: { value: "" } },
  });
  inputScope.state.activeFormat = "md";
  vm.runInContext(source.slice(source.indexOf("async function runSearch("), source.indexOf("function shouldShowSearchChoices(")) +
    source.slice(source.indexOf("async function loadBuildsForArchetype("), source.indexOf("async function refreshVisibleData(")), inputScope);
  const sentence = "围绕青眼，优先后攻，加入灰流丽";
  await inputScope.runSearch(sentence, "ai");
  assert.equal(submissions.at(-1).archetype, "Blue-Eyes");
  assert.equal(submissions.at(-1).requirements, sentence, "Theme routing preserves the complete sentence");
  assert.equal(inputScope.els.input.value, sentence, "Theme results must not replace the user's requirements with the theme label");
  await inputScope.runSearch("青眼白龙，优先后攻", "ai");
  assert.equal(submissions.at(-1).seed.id, blueEyes.id);
  assert.equal(submissions.at(-1).requirements, "青眼白龙，优先后攻", "Card routing also preserves the sentence");
  const castleRequest = "围绕黄金城，后手烧血高抗性卡组";
  const countBeforeAmbiguity = submissions.length;
  await inputScope.runSearch(castleRequest, "ai");
  assert.equal(submissions.length, countBeforeAmbiguity, "Ambiguity must not trigger any model build before confirmation");
  assert.equal(ambiguities.at(-1).choices.length, 2);
  await inputScope.runSearch(castleRequest, "ai", "pick:deck:Eldlich");
  assert.equal(submissions.at(-1).seed.id, lord.id);
  assert.equal(submissions.at(-1).requirements, castleRequest, "Confirmation preserves the original strategy requirements");
  assert.equal(submissions.at(-1).archetype, "Eldlich");
  await inputScope.runSearch(castleRequest, "competitive");
  assert.equal(submissions.at(-1).style, "ai", "Sample-mode ambiguity also waits for a choice");
  await inputScope.runSearch("青眼", "competitive");
  assert.equal(submissions.at(-1).requirements, "", "Sample mode does not inherit previous AI requirements");
  const previousCount = submissions.length;
  await inputScope.runSearch("后手烧血高抗性卡组", "ai");
  assert.equal(submissions.length, previousCount);
  assert.equal(strategySubmissions.at(-1), "后手烧血高抗性卡组");
  assert.equal(inputScope.state.deckVariants.length, 3);
  assert.equal(errors.length, 0);
  assert(!html.includes('id="aiPreferences"'), "The builder no longer requires a second input");
  assert(source.includes('await buildConfiguredDeckChoices(seed, "ai", publicDecks)'), "Local editor must call configured AI");
  assert(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"))).build.files.includes("ai-deck.js"));
  console.log("AI checks passed: endpoint policy, format/seed/count validation, bounded repair, authentication errors, secret storage and provider isolation.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
