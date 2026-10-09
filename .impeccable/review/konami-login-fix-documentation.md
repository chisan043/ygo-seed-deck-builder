# KONAMI login compatibility: reviewed extension evidence

Documentation complete for an ordinary compatibility and error-state extension of the existing deck-transfer Operate surface. The user reported an actual KONAMI 403 inside the desktop window while an external browser could sign in. That report establishes the failure experienced by the user; it does not establish the exact server-side reason for the rejection.

## Incumbent comparison

Checked `PRODUCT.md`, `.impeccable/surfaces/deck-transfer.md`, the historical `.impeccable/review/native-deck-transfer-documentation.md`, the source changes in `electron/deck-transfer-manager.cjs` and `electron/deck-transfer-window.js`, the unchanged `electron/deck-transfer-window.html`, the relevant fixture assertions in `tools/check-electron-deck-transfer.cjs` and `tools/check-native-deck-transfer.cjs`, and the README's verification distinction.

The shell keeps its charcoal background (`#111418`), light text (`#edf3ff`), 15px/1.5 system typography, 20px heading, blue Reopen action, and existing focus treatment. The new Chinese, Japanese, and English 403 messages use the existing status live region and existing error color (`#ffd28a`). No new styling, visual tokens, composition, or global design direction was introduced. The official page and its native login popup retain their own rendering.

## Implemented behavior

The isolated persistent official session now derives a standard Chromium user-agent from the running browser's platform and version rather than sending the application/Electron tokens. Programmatic navigation from a trusted official page supplies its referrer with the `strict-origin-when-cross-origin` policy.

Trusted login popups are now created by Chromium, preserving the original target-window request, POST body, referrer, opener relationship, and official session. Their remote contents have sandboxing and context isolation, no Node integration, and no shell IPC authority. The same trusted-navigation checks apply to the popup. Returning to the official My Deck endpoint reopens the main official view and closes the popup; retry and closing the transfer window also close outstanding login windows.

HTTP 403 navigation produces a distinct localized authentication error. It tells the user to use Reopen to restart login from the official database. Other HTTP errors retain the network state. Recipe filling remains separate from official Save and the game's Copy Deck action, which are still performed by the user.

## Captures and review scope

Opened all seven supplied captures under `/private/tmp/deck-transfer-qa/login-fix/` in this documentation pass:

- `native-auth-zh-full.png`, `native-auth-ja-full.png`, and `native-auth-en-full.png`: the new 403 state at a supplied 900px content width, with the recovery instruction and Reopen control visible and legible.
- `native-login-full.png` and `native-filled-full.png`: the existing login and filled-recipe states, including the explicit official Save and game Copy instructions.
- `native-schema-en-full.png` and `native-network-full.png`: retained schema/network recovery states.

The captures show the composed Electron shell and its WebContentsView. Their visible fixture labels identify synthetic official-page content. The dark regions in the 403/network fixtures are their rendered fixture pages, not evidence of a missing view. These images verify local status layout and recovery copy; they are not captures of authenticated live KONAMI pages.

The supplied fresh finish reviewer `/root/konami_login_finish_reviewer` returned **ship** for this compatibility/error-state scope, validated all seven captures, and requested no material fixes. This records the review's actual scope, without extending it to full account or game completion. The parent reports that the detector ran once on the changed window JavaScript and returned `[]`; this pass did not rerun the detector or finish review.

## Verification and practical limits

The parent reports passing real Electron fixture checks for the standard Chromium identification, navigation source, native login POST/opener preservation, session reuse, origin/IPC isolation, preflight/busy protection, recipe filling, and network/403 retry. Recipe Save was not submitted. Offline and update checks also passed. This documentation pass inspected the fixture assertions and source; it did not rerun those tests.

The parent also reports that two anonymous probes of the official flow reached `my.konami.net/zh_CN/signin` with HTTP 200. This verifies reaching the real account-input page under the tested conditions. Account authentication, official Save, and in-game Copy Deck remain untested. Neither the anonymous probes nor the fixture tests prove the exact cause of the user's original 403 or compatibility with every official account/login variant. The README records this distinction.

A local Mac preview was built at `release/v0.8.0-login-fix/mac-arm64/Yu-Gi-Oh! Seed Deck Builder.app`, and the parent reports that its startup smoke check passed. It is a local preview build, not a newly published release.

## Preserved context

`DESIGN.md` and `.impeccable/design.json` are absent and remain absent. The ordinary-extension handoff preserves the incumbent system; it does not fabricate global design files for this login fix. The surface brief already expresses the built-in transfer workflow and needs no factual addition. Its generic FINISH reference to DESIGN.md is retained as historical context, with the applicable ordinary-extension outcome recorded here.

Pre-existing drift stays untouched: PRODUCT.md still has the obsolete `Register: product` metadata, and earlier evidence records inherited whole-app width, contrast, decorative, and animation concerns. This narrow review does not certify the whole app or repair that drift. Unrelated cache, data, documentation, and tooling changes in the working tree are outside this documentation write boundary.

No shipping raster was added or replaced; the supplied screenshots are QA evidence. The historical native-transfer document remains unchanged. This handoff writes only this evidence document and leaves source files, README, the surface brief, product/global design files, caches, and Git untouched.
