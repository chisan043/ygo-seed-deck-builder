import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const appPath = path.join(root, "app.js");
const source = fs.readFileSync(appPath, "utf8");

function functionBody(name) {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `${name} should exist in app.js`);
  return match[1];
}

const ensureMasterLocales = functionBody("ensureMasterDuelLocaleDataForCards");
assert.ok(
  !ensureMasterLocales.includes('["http:", "https:"].includes(location.protocol)'),
  "static HTTP mode must not request /api/master-duel-card-locales",
);
assert.ok(
  ensureMasterLocales.includes("CAN_USE_LOCAL_API"),
  "Master Duel locale subsets should be gated by CAN_USE_LOCAL_API",
);

const fetchMasterSubset = functionBody("fetchMasterDuelLocaleSubset");
assert.ok(
  fetchMasterSubset.includes("fetchFullMasterDuelLocaleData(ids)"),
  "static mode should read Master Duel locale subsets from the offline locale cache",
);

const fetchLocaleSubset = functionBody("fetchLocaleSubset");
assert.ok(
  fetchLocaleSubset.includes('ensureOfflineScript("data/multilang-aliases.js", "YGO_MULTILANG_ALIASES")'),
  "static mode should load the multilang alias cache before using alias locale subsets",
);
assert.ok(
  !fetchLocaleSubset.includes('if (!CAN_USE_LOCAL_API && window.YGO_MULTILANG_ALIASES)'),
  "static mode should not depend on the alias cache having been loaded by an earlier path",
);

const renderTrendPanel = functionBody("renderTrendPanel");
const emptyTrendBlock = renderTrendPanel.match(/if \(!items\.length \|\| !total\) \{([\s\S]*?)\n  \}/);
assert.ok(emptyTrendBlock, "renderTrendPanel should have an explicit empty-trend branch");
assert.ok(
  emptyTrendBlock[1].includes("renderPowerRankings(state.formatPowerRankings[state.activeFormat])"),
  "Power rankings should still render when recent trend items are empty",
);

console.log("static offline behavior checks passed");
