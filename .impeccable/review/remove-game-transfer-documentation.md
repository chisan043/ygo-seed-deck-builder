# Remove game transfer: shipped scope

This incumbent Operate correction addresses game-import controls remaining in the builder and local editor after rollback. Both button IDs, hidden transfer panels, routes, listeners, lifecycle handling, the Master Duel transfer validator, and `officialImportUrl` protocol were removed. Chinese, Japanese, English, and HTML fallback copy now describe local recipe exchange without external game or extension instructions.

Local YDK/YDKE import and export remain supported. The four local codecs preserve standard Base64 output and legacy URL-safe decoding. The app still detects unknown cards and preserves original quantities. Saved decks remain intact. The editor reserves three grid rows for its header, export actions, and cards; measured action height is 32px, correcting the previous zero-height row overlap.

Validation evidence supplied by the implementing agent: Node syntax, local recipe, and AI tests passed; `npm run check:offline` passed against a clean Git archive with changed sources copied in. Browser checks used a selected Dracotail recipe and an existing saved deck. All three languages showed zero game-import buttons. A one-card Blue-Eyes YDK preview accepted zero extra cards without saving; no existing deck was modified.

Four control-only crops document builder/editor at 1280×720 and 1170×664: `no-game-import-{builder,editor}-{desktop,user1170}.png`. They support action-area claims only. Review initially requested a fallback-copy fix; its correction and HTML regression assertion resolved both scored findings without batch regressions. The same crops remain valid because translated DOM is unchanged.

Preexisting contrast, headings, glow, fonts, grid, transitions, missing DESIGN, and obsolete PRODUCT Register remain outside scope. Historical transfer documentation remains historical. No global design files, visual world, composition, or assets were changed.
