# AI API settings: incumbent extension evidence

This document records an ordinary Operate extension inside the existing deck builder. Source evidence checked: `PRODUCT.md`, `.impeccable/surfaces/ai-settings.md`, the current changes in `index.html`, `styles.css`, and `app.js`, the scoped dot-path guard in `tools/serve-with-refresh.mjs`, and the four screenshots listed below. The documenter reference was read at `/Users/chi/.codex/skills/impeccable/reference/document.md`. Only this scoped evidence document is written by this pass; it establishes no new global visual authority.

## Incumbent fit and actual additions

The extension retains the warm charcoal workbench, inherited Open Sans/system text stack, compact controls, blue primary actions, dark ghost actions, and card/data emphasis. It introduces no new font, imagery, logo, animated motif, page identity, or approved design world. The settings disclosure sits immediately after the existing search controls; optional preferences and request feedback precede the existing result panels. This preserves the builder's sequence while letting players configure and use their own model without leaving it.

Both new containers use the same dark panel and field vocabulary as the incumbent transfer/import extension: panel background `#111418`, text `#edf3ff`, border `1px solid #414955`, and no added shadow. Panel padding is `16px 20px`. The disclosure summary uses inherited typography at `16px`, weight `700`; descriptive text is `#c1ccde`, capped at `75ch`, with line height `1.65`. Field labels use weight `600`. Settings fields use a `2fr 1fr 1.4fr` grid with a `16px` gap; endpoint receives the greatest width.

Endpoint, model, password, and preferences fields inherit the font and use background `#0c1016`, border `#596779`, text `#edf3ff`, `4px` corners, and `10px 12px` padding. The input-to-label gap is `8px`. Placeholders use `#aebacd` at full opacity, and the caret uses `#a9d6ff`. The preferences textarea starts at `64px` and resizes vertically. Existing primary/ghost buttons and wrapping recipe action rows are reused; there is no new button family. Checkbox accents use `#a9d6ff`, with `16px` native inputs and an `8px` text gap.

## Labels, contrast, focus, and feedback

The disclosure uses native `details`/`summary`, preserving keyboard activation and expanded state semantics. Explicit `for`/`id` label associations cover all fields. Endpoint and model are required; key remains optional for local services. The key is a password field, with retention guidance connected through `aria-describedby="aiKeyHint"`. The preferences section is named by its label, and its visible copy identifies it as optional. Placeholder text supplements the labels rather than replacing them.

The current HTML has `role="status" aria-live="polite"` on both settings feedback and the model-mode/request hint. The latter is the narrow finish-review correction applied by the parent; it makes changing generation, mode, and fallback text available to assistive technology. The pixel captures cannot establish live announcement behavior.

Source-color relative-luminance calculations give the following contrast ratios. These document local solid-color pairs, not a certification of the whole legacy workbench or every inherited button state.

| Foreground / background | Ratio | Use |
| --- | ---: | --- |
| `#edf3ff` / `#111418` | 16.59:1 | Panel text and labels |
| `#c1ccde` / `#111418` | 11.40:1 | Help and request status |
| `#edf3ff` / `#0c1016` | 17.13:1 | Entered field text |
| `#aebacd` / `#0c1016` | 9.72:1 | Placeholder text |
| `#ffbcac` / `#111418` | 11.47:1 | Error text |
| `#a9d6ff` / `#111418` | 12.09:1 | Focus outline against panel |
| `#596779` / `#0c1016` | 3.31:1 | Field border against field fill |

Keyboard focus uses a `2px` light-blue outline offset by `3px`, scoped to both new surfaces; the 746px form screenshot visibly demonstrates focus on the model input. The summary hover uses that same light blue. Errors receive readable peach text in addition to explanatory words. Settings feedback reserves `24px` minimum height and allows long text to wrap. Disabled settings buttons use opacity `.55` and a disabled cursor. New CSS adds no motion; inherited reduced-motion behavior is preserved.

## States and interaction evidence

Chinese, Japanese, and English entries cover new labels, actions, placeholders, storage explanations, model attribution, and errors. Language switching refreshes dynamic settings text. The supplied four captures show Chinese, so three-language copy coverage is established from source here rather than from a screenshot in each language.

Save, test, enable, and clear are distinct controls. Test validates the form and reports progress/success/failure without implying settings have been saved. Save clears the key field, refreshes mode guidance, and selects AI builds when enabled. An existing key can be retained through an empty field at the same endpoint; changed endpoint guidance requires a new key. Clear removes the key and disables API builds. The browser guidance accurately distinguishes page-memory key retention from saved endpoint/model/enabled metadata. Desktop encryption retention is displayed only when the native bridge reports secure storage capability; otherwise session-only guidance appears.

Testing and generation reveal a cancel button and disable settings, search submission, seed input, format/style selectors, and local auto-build until completion. Cancellation aborts the browser request and invokes native cancellation when available. Optional preferences remain editable and are stored separately. Generation checks enabled settings and AI build mode; real-sample mode retains its existing behavior. Failed model builds explicitly identify local-algorithm fallback, while cancellation reports cancellation. Model results reuse existing deck titles/evidence areas for model name, strategy, and warnings; their copy distinguishes local ID/format/count/seed validation from effect interactions that still need playtesting. The main deck notice now also uses the existing `aiModelEvidence` text for `modelGeneration` decks, providing model attribution and the checked scope rather than the legacy heuristic notice. Strategy and warnings are inserted as text nodes.

The surface contract preserves the native game-transfer rollback. This pass changes no transfer code or behavior and does not reinterpret that removed feature as part of the model settings extension.

## Rendered and responsive evidence

All four required files were opened and visually inspected:

- `ai-settings-desktop.png` (`1366 × 1927`): full builder context, open three-column settings, mock-model test success, enabled state, preferences, and model-mode hint. The new controls remain aligned with incumbent panels.
- `ai-settings-minimum.png` (`1280 × 1927`): supported minimum-width context; three fields and actions fit without clipping inside the new surfaces.
- `ai-settings-form.png` (`1310 × 377`): close form crop confirms labels, entered endpoint/model, empty-key retention placeholder, help, enable control, actions, and feedback.
- `ai-settings-user-746-form.png` (`714 × 541` crop from the 746px case): settings fields stack in label order, long help wraps, buttons fit, and the model field's keyboard focus is visible.

At viewport widths up to `760px`, the new surfaces use `14px` padding and a width cap of `calc(100vw - 32px)`, the field grid becomes one column, and request status allows wrapping. Action rows already wrap. These are local responsive improvements within a desktop-oriented incumbent: the inherited `1280px` body/app minimum width still permits horizontal overflow of the broader workbench on narrow screens. The 746px crop establishes form behavior, not full-page mobile fitness.

## Scope and evidence limits

The captures use an example endpoint and mock/test model in the browser UI. They establish visible layout, copy, field styling, a success state, and one focus state. Busy, cancellation, error, fallback, and model strategy behavior are documented from the checked source rather than asserted as visible in these four screenshots. Screen-reader announcements and complete tab sequencing were not tested by this documenter pass. All four required captures remain present; malformed supplementary narrow full-page captures were removed and are not evidence for this document.

The parent reports a passed native smoke in an isolated temporary user-data directory, using the real sandboxed preload, main-window IPC, Electron networking to a localhost mock, and session key retention/clearing. The parent also reports passing offline, update, and AI suites. These results extend functional evidence beyond the browser screenshots; this documentation pass did not rerun those checks. No real provider or persistent native encrypted-key smoke was run, so provider availability, real recipe quality, persistent encrypted-key behavior, and end-to-end game behavior remain unestablished. The finish verdict remains separate evidence.

The local server now refuses requests containing any dot-prefixed path segment. The checked guard in `tools/serve-with-refresh.mjs` therefore keeps `.impeccable` surface contracts and QA evidence unavailable through that browser server, while this local documentation remains inspectable from the workspace.

`DESIGN.md` is absent, and `PRODUCT.md` retains its obsolete Register value (`product`). Both are pre-existing documentation drift reported without repair. The surface brief's generic finish wording requests `DESIGN.md`, but this narrow incumbent extension does not authorize inventing or replacing a global design system. No design sidecar is generated. No shipping raster asset was added or changed; these PNGs are QA evidence, so new raster-asset provenance work is inapplicable.
