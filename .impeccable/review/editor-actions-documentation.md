# Editor actions removal

The local deck editor’s Download YDK and Copy YDKE row, two IDs, listeners, dead helper, toast keys, and row CSS were removed. Its two-row grid returns to `42px minmax(0, 1fr)`. README and existing regression checks were updated. Builder exports, local recipe import, and saved decks remain unchanged.

Evidence: focused header/main-card crops `editor-no-exports-desktop.png` and `editor-no-exports-user1170.png`, from 1280×720 and 1170×664 viewports. These support neither whole-page nor mobile claims. Chinese, Japanese, and English browser checks found zero removed IDs; header bottom 200 and board top 216 preserve a 16px gap; board height is 488px. Node syntax, local recipe, AI, and diff checks passed.

This narrow incumbent operation changes no global design or assets. Existing detector findings, missing DESIGN, and obsolete Register drift remain outside scope. Historical transfer-removal documentation is superseded only for these editor actions.
