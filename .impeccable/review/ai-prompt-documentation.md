# AI settings navigation and editable prompt: extension evidence

## Scope and incumbent fit

This records the ordinary Operate extension requested for API settings after Banlist and an actual prompt that other users can edit. Checked sources: `PRODUCT.md`, `.impeccable/surfaces/ai-settings.md`, `index.html`, `styles.css`, `app.js`, `ai-deck.js`, and `electron/ai-client.cjs`. The documenter reference at `/Users/chi/.codex/skills/impeccable/reference/document.md` was read. The three current screenshots listed below were opened and visually inspected. Only this evidence Markdown is written by this pass; no global design authority or source is changed.

The extension retains the warm charcoal workbench, existing fonts, dark panels, blue primary actions and focus treatment, and inherited ghost buttons. No new page identity or shipping raster asset is introduced. Panel background remains `#111418`, text `#edf3ff`, border `#414955`, and padding `16px 20px`. Inputs inherit typography, use `#0c1016` fill, `#596779` borders, `4px` corners, and `10px 12px` padding. The connection grid retains `2fr 1fr 1.4fr` columns with a `16px` gap.

The earlier `ai-settings-documentation.md` remains historical evidence for the prior inline placement. This document supersedes its placement and prompt descriptions for the current implementation.

## Navigation, forms, and request behavior

The existing navigation now orders Builder, Decks, Banlist, then AI settings. The page has two separate forms: endpoint/model/key connection settings first, followed by the editable system prompt. Per-build preferences and model/request guidance remain in the builder. A Return to builder action navigates back and focuses the seed-card input.

Connection save, test, and clear remain distinct actions. Endpoint and model are required; the password key field supports local services without a key. Test uses the entered connection without implying it has been saved. Saving connection settings retains the saved prompt; clearing a key also retains it. Browser key retention is page-memory only, while endpoint/model/enabled metadata persist separately. Native retention guidance depends on the bridge's secure-storage capability.

An active test or generation shows cancellation in both the builder and settings page. The connection controls and prompt editor/actions are disabled while the request runs; the settings cancel control remains usable. Cancellation aborts the browser controller and calls native cancellation when present. Generation retains the existing local algorithm fallback and labels its use after model failures.

## Actual prompt, persistence, and accessible feedback

`ai-deck.js` exports the shared `DEFAULT_SYSTEM_PROMPT`, `OUTPUT_RULES`, and prompt normalization. The textarea shows the actual saved system prompt. Both the browser-backed request path and native client use the shared message builder: saved prompt plus appended output rules as the system message, and structured candidate/format/preferences context as the user message. The default asks for coherent engines, summonable extra-deck choices, strategy, and uncertainty warnings; its presence does not establish real deck quality.

Prompt save is independent of valid or configured API fields. Browser persistence uses `deckBuilderAISystemPrompt`; native `savePrompt` updates `ai-settings.json` while preserving connection configuration. Native connection save preserves the existing prompt. Unsaved edits do not affect generation. Reset replaces the editor draft with the shared default and explicitly requires Save prompt before taking effect. Normalization rejects empty content or more than 12,000 characters.

The appended JSON rules are exposed through a native `details` disclosure as read-only, wrapping text. They remain shared backend rules rather than part of the editable draft. Canonical IDs, counts, copy limits, seed inclusion, and deck-section checks remain enforced by local validation; card-effect interactions are outside that validation.

Fields have explicit labels, help associations, and visible focus treatment (`2px` light-blue outline, `3px` offset). Independent connection and prompt feedback use polite live status regions. Chinese, Japanese, and English entries distinguish saved, unsaved, reset-draft, and invalid states. Prompt textarea height is at least `320px`, resizes vertically, and uses `1.7` line height. Read-only rules use wrapping `13px` text. This pass did not test screen-reader announcements or complete keyboard sequencing.

## Rendered and functional evidence

- `ai-page-desktop.png` (`1366 × 1522`): actual header and navigation, three-column connection form, separate prompt form with default content, independent actions, and expanded appended rules.
- `ai-page-minimum.png` (`1280 × 1522`): actual supported minimum-width header and full settings page; fields and prompt controls fit within their panels.
- `ai-page-narrow-form.png` (`714 × 550`, cropped from a 746px viewport): isolated connection form with stacked fields, wrapping help, and visible actions. The capture neutralized the topbar for isolation; it does not establish full-page narrow navigation or prompt layout.

At widths up to `760px`, local settings panels use `14px` padding and a `calc(100vw - 32px)` width cap; connection fields stack. The incumbent body/app minimum width remains `1280px`, so these captures do not establish full mobile support.

The parent reports passing browser mock checks for prompt save without API configuration, reload persistence, API save preserving the prompt, generation receiving the custom prompt, cancellation, reset followed by save, Chinese/Japanese/English switching, and no page errors. The parent also reports an isolated Electron check using the actual sandboxed preload and trusted IPC to save/read a custom prompt and confirm that API configuration save preserves it. Manager restart-persistence unit coverage passed. Offline, update, and AI suites passed against an isolated committed-data snapshot. This documenter pass inspected source and screenshots but did not rerun those checks.

## Disposition and limits

The fresh reviewer returned **ship**, with no material fixes in the changed scope. No detector rerun was performed. No real provider call or real recipe-quality evidence is established by the mock and persistence checks.

`DESIGN.md` is absent, and `PRODUCT.md` still records the obsolete Register value `product`. Both are pre-existing documentation drift, reported without repair. The surface brief's generic finish reference to `DESIGN.md` does not expand this narrow evidence-only assignment into global design-system work. No `DESIGN.md` or `.impeccable/design.json` is created. The PNGs are QA captures, and no shipping raster provenance work is required for this extension.
