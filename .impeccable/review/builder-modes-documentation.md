# Builder sample and model modes

## Scope

This incumbent refinement merges per-build model requirements into the builder’s search and mode-selection panel. It follows `PRODUCT.md` and the updated `.impeccable/surfaces/ai-settings.md`: familiar dense controls, card data as the visual center, charcoal panels, green selected radios and existing blue actions/focus treatments. The request area spans the control panel below a thin top divider, rather than forming a separate panel. No visual-world workshop, concept comp, seed, new imagery or shipping raster asset applies.

Implementation is in `index.html`, `styles.css`, `app.js`, `README.md` and `tools/check-ai-decks.cjs`. The final asset query tokens reload the corrected copy; they do not change layout. API-key retention and editable system-prompt management retain their existing behavior.

## Behavior

- **Real samples first** returns matching public recipes only and never calls the model. Its status explains this distinction. No matches produce an explicit no-samples error instead of a synthetic recipe.
- **AI model builds** requires an enabled, configured endpoint and model. Optional requirements appear only in this mode; they share the search panel with status and cancellation controls. When the API is disabled, the configuration action opens AI settings and focuses the endpoint field.
- A successful model request returns one accepted model recipe, validated locally for card IDs, format, copy limits, deck counts and the seed. Public or heuristic recipes are not appended. Network failure, invalid output and cancellation remain errors; none silently switches to an algorithm.
- Failed theme searches clear the previous results. Mode radios are saved and restored. Chinese, Japanese and English consistently name the AI model mode. Legacy local algorithm recipes remain readable with copy that distinguishes their origin.

The request status uses a polite live region. The requirements field retains a visible label and the incumbent focus styling. This record does not claim a full accessibility audit.

## Visual evidence

The existing safer HTTP preview at `http://127.0.0.1:5181` was used after browser policy blocked the original file URL. All required captures were viewed and checked for correct page-top positioning and absence of floating-header capture artifacts:

- [Sample mode, desktop](builder-modes-samples-desktop.png): full-page capture from scroll Y = 0, 1280 × 1427 pixels.
- [AI mode, desktop](builder-modes-ai-desktop.png): full-page capture from scroll Y = 0, 1280 × 1529 pixels.
- [AI mode, narrower user viewport](builder-modes-ai-user796.png): measured viewport 796 × 664; full-page raster 1280 × 1915 because the inherited global minimum width remains 1280 pixels.

The desktop filenames correct an earlier 1366-pixel mislabel; the measured desktop width is 1280 pixels. The narrower capture records existing overflow and stacked sections; it establishes no mobile-fitness claim. [Controls crop](builder-modes-controls.png) is optional final-presentation evidence. These files are review captures, not shipped product assets.

## Verification

Browser checks confirmed that a 青眼 sample search returns five real recipes, switching to unconfigured model mode reports the setup error and leaves zero old results, and the setup action focuses the endpoint. All three languages and persisted mode selection were checked.

Meaningful VM tests execute the actual routing functions: sample mode never requests a model; empty samples error; disabled AI never invokes heuristics; successful model mode returns only its model recipe; network and invalid-recipe failures release busy state. `npm run check:ai`, the full `check:offline` suite against a clean committed-data snapshot, JavaScript syntax and diff checks passed. No real API key or external provider call was used, and these results do not establish real model recipe quality or gameplay effectiveness.

## Review and limits

A fresh five-section review matched the merged layout, conditional fields, configuration action, typography, material and ground, while retaining the narrower viewport’s existing overflow. It requested two copy corrections: README must describe model failure as error-only, and Chinese `aiSaved` must use the renamed mode. Both were fixed. The bounded follow-up found both resolved, no regressions from those copy changes, remaining findings clear, and disposition **ship**. No numerical scores were supplied.

The detector ran once and saved `/tmp/builder-modes-detector.json`; its findings were pre-existing and outside this refinement. Missing `DESIGN.md` and obsolete `PRODUCT.md` Register metadata are also pre-existing drift. They were not repaired or promoted into a new design system. Earlier AI settings, prompt and key-notice records remain historical; this document describes the current builder modes.
