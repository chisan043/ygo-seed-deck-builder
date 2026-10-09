# Deck transfer: shipped extension evidence

This is an ordinary extension of the existing Operate interface. Sources checked: `styles.css`, `index.html`, `app.js`, `deck-transfer.js`, `PRODUCT.md`, and `.impeccable/surfaces/deck-transfer.md`. The incumbent charcoal surfaces, blue actions, Open Sans/system text stack, and existing button variants remain. No new visual world or approved system replacement exists; no `DESIGN.md` or design sidecar was created.

## Actual visual additions

- Inline transfer/import panels use background `#111418`, border `1px solid #414955`, text `#edf3ff`, and padding `20px`. The builder panel spans both deck columns; its scoped `padding-top: 20px` corrects the inherited section padding of `2px` found in finish review.
- Panel titles are `20px`, with a `12px` lower margin. Paragraphs and list items retain inherited typography, use line height `1.65`, and cap text at `75ch`. Paragraph margins are `10px`; ordered lists use `14px` margins and `24px` logical indentation; consecutive steps have `10px` separation.
- Action rows wrap with a `10px` gap and `16px` top margin. Primary and ghost controls reuse the incumbent blue and dark button vocabulary and `3px` corners. At widths up to `760px`, panel padding becomes `14px`, panel width is bounded by `calc(100vw - 32px)`, and primary action text can wrap.
- New text fields use background `#0c1016`, border `#596779`, text `#edf3ff`, `4px` corners, `10px` padding, and inherited font. Labels use weight `600`; textarea height starts at `100px` and can resize vertically. Preview lists scroll above `240px`.
- Links, caret, and keyboard focus use `#a9d6ff`; links remain underlined. Focus is a `2px` outline offset by `3px`. Warnings use `#ffd28a`; disabled buttons use opacity `.55` and a disabled cursor. These are local implemented values, not invented global tokens or future system rules.

## Interaction and disclosure

Transfer controls sit beside existing builder exports and local editor actions. The revealed panel shows recipe name/counts, rule date or cached-rule disclosure, setup links, English official-database requirement, and the official editor action. The user has confirmed the linked KONAMI account; installation/sign-in guidance remains visible. The bridge opens the English official editor with an encoded recipe; the user must check/name/save there and then use Copy Deck in the game. Unowned cards still require acquisition. The fallback names the external-browser requirement and clipboard YDKE route explicitly.

Master Duel transfer checks 40–60 main cards, at most 15 extra cards, card availability/section, and combined copy limits. Issues disable the editor/link actions. Checked recipe snapshots are used for actions; edits close stale transfer panels. Closing returns focus to the opener, and scroll positioning accounts for the sticky header.

Import supports YDK files, pasted YDK/YDKE, and card-name lists. Associated labels, a status/live region, focused textarea on opening, and focus return on cancel support keyboard use. A quantity-preserving preview is required before saving; unknown cards prevent saving. Side cards are explicitly disclosed as omitted from saved local decks. Editing source text invalidates the preview. YDK downloads contain the actual recipe file; the codec emits standard Base64 YDKE and accepts prior URL-safe exports.

## Verification and remaining limits

Supplied local verification passed. QA evidence includes `import-valid-zh.png`, transfer panels in Chinese/Japanese/English at desktop width, Chinese at 746px, English at 390px, `viewport-en-390.png`, and `build-transfer.png` under `/private/tmp/deck-transfer-qa/`. Desktop English and 390px English panel evidence were inspected directly in this documentation pass. The initial 390px heading recapture was resolved through corrected scroll positioning; the sole builder-heading spacing correction was reviewed with a ship verdict. No actual account/game endpoint was exercised, so local verification does not establish end-to-end account or game success.

The detector ran once in the parent workflow and was not rerun here. Inherited `1280px` minimum-width overflow and legacy contrast, shadows/glows, and header styling remain outside this extension; they are not canonized as system guidance. `PRODUCT.md` retains the pre-existing obsolete Register entry (`product`), reported without repair. The surface brief's finish wording requests a design document generically, but the shipped documenter workflow preserves the incumbent system for ordinary extensions. No shipping raster asset was added or replaced; screenshots are QA evidence only, so raster provenance work is inapplicable.
