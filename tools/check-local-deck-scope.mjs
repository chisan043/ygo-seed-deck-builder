import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(resolve(root, "app.js"), "utf8");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const css = readFileSync(resolve(root, "styles.css"), "utf8");

function assertMatch(source, pattern, message) {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
}

function assertNoMatch(source, pattern, message) {
  if (pattern.test(source)) {
    throw new Error(message);
  }
}

assertMatch(
  app,
  /state\.localCardHistoryIds\s*=\s*\[\s*id,\s*\.\.\.state\.localCardHistoryIds\.filter/s,
  "history should keep the newest card id first",
);
assertMatch(
  app,
  /const historyCards = localCardsFromIds\(state\.localCardHistoryIds\);/,
  "history rendering should preserve newest-first id order",
);
assertNoMatch(
  html,
  /id="duplicateLocalDeckCase"|id="deleteLocalDeckCase"|class="local-library-toolbar-actions"/,
  "deck library should not render duplicate/delete actions in the top-right toolbar",
);
assertMatch(
  html,
  /class="local-library-actions"[\s\S]*id="localLibraryPublicSearch"[\s\S]*id="importLocalDeck"/,
  "deck library footer should expose public search and import actions",
);
assertNoMatch(
  html,
  /id="localLibraryDeckList"/,
  "deck library should not render the obsolete deck-list button",
);
assertMatch(html, /styles\.css\?v=20260625-ydk-import-extra/, "stylesheet cache key should reflect local deck case layout changes");
assertMatch(html, /app\.js\?v=20260625-ydk-import-extra/, "script cache key should reflect local deck case layout changes");
assertNoMatch(app, /duplicateLocalDeckCase: document\.querySelector|els\.duplicateLocalDeckCase/, "duplicate toolbar button should not be wired");
assertNoMatch(app, /deleteLocalDeckCase: document\.querySelector|els\.deleteLocalDeckCase/, "delete toolbar button should not be wired");
assertMatch(app, /function duplicateLocalDeck\(/, "deck library should support duplicate");
assertMatch(app, /function deleteLocalDeckById\(/, "deck library should support deleting a selected case");
assertMatch(app, /function importLocalDeckPrompt\(/, "deck library should support importing pasted deck text");
assertMatch(
  app,
  /const section = sectionHint === "extra" \? "extra" : sectionHint === "main" \? "main" : isExtraDeck\(parsed\.card\) \? "extra" : "main";/,
  "YDK import should preserve #main/#extra sections instead of re-guessing every card",
);
assertMatch(
  app,
  /\\b\(Fusion\|Synchro\|XYZ\|Xyz\|Link\)\\b[\s\S]*type\.includes\("Monster"\)/,
  "extra-deck detection should include compound types like Synchro Tuner Monster",
);
assertMatch(
  css,
  /\.local-deck-library-view\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;/,
  "deck library should reserve a footer row so actions stay visible",
);
assertMatch(
  css,
  /\.local-library-actions\s*\{[\s\S]*?justify-content:\s*end;[\s\S]*?align-self:\s*end;/,
  "deck library footer actions should stay pinned to the bottom right",
);
assertMatch(
  app,
  /data-local-deck-action="duplicate"[\s\S]*data-local-deck-action="delete"/,
  "deck cases should render duplicate and delete actions",
);
assertMatch(app, /function resetLocalDeckGridScroll\(\)[\s\S]*?window\.setTimeout\(reset,\s*250\);/, "deck library grid should reset after browser scroll restoration");
assertMatch(
  css,
  /\.local-deck-grid\s*\{[\s\S]*?overflow-y:\s*auto;/,
  "deck library grid should scroll when more than one screen of decks exists",
);
assertMatch(
  css,
  /\.local-deck-grid\s*\{[\s\S]*?grid-auto-rows:\s*260px;/,
  "deck library grid should preserve full deck-case rows instead of compressing cards",
);
assertMatch(
  css,
  /\.local-deck-case\s*\{[\s\S]*?display:\s*flex;[\s\S]*?height:\s*260px;[\s\S]*?min-height:\s*260px;/,
  "deck cases should be tall enough to contain title and duplicate/delete actions",
);
assertMatch(
  css,
  /\.local-deck-case-actions\s*\{[\s\S]*?flex:\s*0 0 auto;[\s\S]*?min-height:\s*30px;[\s\S]*?margin-top:\s*auto;/,
  "deck case action buttons should stay inside the deck case",
);
assertMatch(
  css,
  /\.local-editor-view\s+\.local-card-tile\s*\{[\s\S]*?border-color:\s*transparent;[\s\S]*?background:\s*transparent;/,
  "middle editor card tile frames should be transparent",
);
assertNoMatch(
  css,
  /\.seed-card\s*>\s*div\s*>\s*\.seed-desc/,
  "this scoped change should not reintroduce the rejected builder-card-detail scroll tweak",
);

console.log("local deck scope checks passed");
