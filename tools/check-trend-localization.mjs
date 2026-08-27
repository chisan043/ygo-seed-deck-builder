import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");

function functionBody(name) {
  const match = source.match(new RegExp(`(?:async )?function ${name}[^\\n]*\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `${name} should exist in app.js`);
  return match[1];
}

const inferred = functionBody("buildInferredArchetypeLocales");
assert.ok(
  inferred.includes('locale["ja-JP"]?.name') && inferred.includes('storedLocale["ja-JP"]?.name'),
  "archetype inference should use Japanese official card names",
);
assert.ok(
  inferred.includes("return { zh, ja };"),
  "archetype inference should produce both Chinese and Japanese labels",
);

const ensureTrendLocales = functionBody("ensureTrendLocaleData");
assert.ok(
  ensureTrendLocales.includes("JSON.stringify(state.inferredArchetypeLocales || {})"),
  "trend localization should rerender when Chinese or Japanese inferred labels change",
);

for (const [language, names] of Object.entries({
  zh: ["Darklord", "Ancient Gear", "HERO"],
  ja: ["Darklord", "Ancient Gear", "HERO", "HEROs"],
})) {
  for (const name of names) {
    const keyPattern = name.includes(" ") ? `"${name.replaceAll(" ", "\\s+")}"` : `["']?${name}["']?`;
    assert.ok(
      new RegExp(`${language}:\\s*\\{[\\s\\S]*?${keyPattern}\\s*:`).test(source),
      `${language} trend map should include ${name}`,
    );
  }
}

console.log("trend localization checks passed");
