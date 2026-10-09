# Built-in deck transfer: shipped extension evidence

Documentation complete for an ordinary extension of the existing Operate surface. The user requested desktop transfer inside the app after finding the external-extension workflow too complicated. The finished implementation keeps the incumbent charcoal panels, blue primary action, compact buttons, and existing main-app typography. It adds a native official-browser window and progressive disclosure of backup exports; it does not establish a replacement visual world.

## Sources and comparison

Checked `PRODUCT.md`, `.impeccable/surfaces/deck-transfer.md`, the earlier `.impeccable/review/deck-transfer-documentation.md`, the transfer functions and localized copy in `app.js`, transfer rules in `styles.css`, and `electron/main.cjs`, `electron/preload.cjs`, `electron/deck-transfer-manager.cjs`, `electron/deck-transfer-page.cjs`, `electron/deck-transfer-window-preload.cjs`, `electron/deck-transfer-window.html`, and `electron/deck-transfer-window.js`.

The extension retains the existing inline panel background (`#111418`), border (`#414955`), text (`#edf3ff`), 20px padding and 20px title. Main-app actions retain their primary/ghost variants, wrapping layout, and focus treatment. Below 760px, panel padding is 14px and its width is bounded by `calc(100vw - 32px)`. The backup disclosure has an 18px top margin and a blue (`#a9d6ff`) native summary control. Selection uses `#235782` with white text. These are observed local implementation values, not new global tokens.

The separate Electron shell repeats that panel palette and blue action vocabulary using a 15px/1.5 system-font body, 20px heading, 13px origin line, 3px button corners, and a 2px focus outline offset by 3px. Its header starts at 164px; a ResizeObserver reports its actual height to position the official WebContentsView beneath wrapped content. The window starts at 1120×850 and has a 900×650 minimum. The official site's content is a separate surface and retains its own rendering.

## Implemented behavior

The builder/local-editor transfer action checks the recipe and, when desktop APIs are available and checks pass, opens the official window immediately. The inline panel keeps recipe counts, rule freshness, status, a reopen action, and concise official Save/game Copy instructions visible. YDK, YDKE, and extension-link exports sit inside a collapsed disclosure. Browser mode retains explicit external-extension setup guidance.

The official view uses a persistent, isolated session with context isolation, sandboxing, and no Node integration. The shell shows the current official origin and localized Chinese/Japanese/English status. The adapter follows official My Deck/create/editor links, requests the English official editor, and fills recognized blank form slots from the checked recipe snapshot. Existing cards yield an occupied warning rather than being overwritten. Missing official card IDs disable built-in transfer while leaving backup exports available. A second different recipe cannot replace an active transfer window.

The adapter does not inspect login credentials or submit the form. The user signs in on the official page, checks the filled cards and deck name, clicks the official Save button, and then uses Copy Deck in the game. “Filled” explicitly means not yet saved. Unrecognized schema, occupied deck, failed network, and blocked navigation have visible status messages; retry is disabled after filling. The shell's status is a polite live region, and the main panel returns keyboard focus when closed.

## Evidence inspected and verdict scope

Opened all supplied final captures under `/private/tmp/deck-transfer-qa/native/` in this documentation pass:

- Main transfer panels: `main-zh-1440.png`, `main-ja-1440.png`, `main-en-1440.png`, `main-zh-746.png`, and `main-en-390.png`. These are panel crops taken at the named viewport widths; they show localized wrapping and collapsed backup exports.
- Builder and validation states: `build-native.png` and `missing-id.png`.
- Composed Electron window with its WebContentsView: `native-login-full.png`, `native-filled-full.png`, `native-occupied-full.png`, `native-schema-full.png`, `native-schema-en-full.png` (900px content width), and `native-network-full.png`. Their visible fixture labels identify synthetic page content. The shell and fixture are both present, with status and recovery instructions legible above the official-view area.

The supplied full finish review from `/root/native_transfer_finish_reviewer` returned **ship** across its reviewed matrix, with no material fixes. This records that review's interface scope; it does not claim live account/game completion. The parent reports that real Electron fixture tests passed without Save or POST. This documentation pass checked code and captures and did not rerun tests, the detector, or the finish review.

Real KONAMI authentication, official Save, and in-game Copy Deck remain untested. Fixture success establishes the local adapter and window states, not continued compatibility with every live official login/editor variant. The official form structure may change; schema failure and backup export remain the implemented recovery path.

## Preserved context and limits

`DESIGN.md` and `.impeccable/design.json` are absent and remain absent. Ordinary-extension documentation preserves the incumbent system rather than inventing a global visual specification. The surface brief already describes the built-in transfer and requires no factual addition. Its generic FINISH wording mentions DESIGN.md; the ordinary-extension handoff above records the applicable preservation outcome.

Pre-existing `PRODUCT.md` drift, including the obsolete `Register: product` metadata, is reported without repair. The once-run detector report at `/private/tmp/deck-transfer-qa/native/detector.json` contains two inherited `styles.css` findings: width animation at line 4390 and decorative grid-line background at line 2339. Those remain outside this extension and are not promoted into design guidance. Earlier documentation also records inherited whole-app minimum-width/contrast/decorative issues; narrow-panel evidence does not certify the entire app's responsive or accessibility behavior.

No shipping raster was added or replaced. The screenshots are QA evidence, so no new shipping asset provenance work is required. This handoff writes only this evidence document and leaves product/source files, README, global design context, caches, and Git untouched.
