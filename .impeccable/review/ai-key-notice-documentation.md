# API key storage notice

## Scope

The AI settings connection form places a small red notice immediately beneath the API fields. The API key input references it through `aria-describedby`. The notice uses the existing help-text treatment with red (`#ff9f9f`), 12px text, preserved line breaks and wrapping for long filesystem paths. Chinese, Japanese and English describe the same storage behavior and backup assurance. This is a local extension of the existing workbench; no visual world, global design system or shipping raster assets changed.

## Storage and backup assurance

Browser keys stay in the current page's memory and must be entered again after reloading or reopening. Desktop notices display the actual `ai-settings.json` path returned by the manager's `getConfig()` from the Electron user-data directory. A key is written there with system encryption only after the user selects encrypted retention and saves; otherwise it stays in memory for the current app session. When secure storage is unavailable, the notice describes session memory and no persisted key. Other settings can still be written to the settings file.

The concise assurance is “密钥仅在本地保存，不会上传备份。” Japanese and English carry equivalent wording; English reads “The key is stored locally only and is never uploaded for backup.” The desktop notice also explains that changing the endpoint requires a new key.

## Evidence

- [Browser connection panel at 1366px](ai-key-browser-1366.png): isolated panel crop showing placement and red notice.
- [Browser connection panel at 746px](ai-key-browser-746.png): isolated panel crop showing narrow layout and wrapping.
- [Native Electron connection panel](ai-key-desktop-native.png): real retina crop using temporary isolated user data and a mock localhost endpoint; the rendered path is the actual temporary manager file path.

These review captures were refreshed and re-viewed after the concise copy correction. They are not shipping assets. No real key, external provider or production user-data directory was used. A fresh reviewer issued a five-section finish review with disposition **ship**, without material fixes, confirming the backup assurance, actual path, conditional storage and wrapping.

## Validation

`npm run check:ai` passed, including the actual storage-path assertion. JavaScript syntax and diff checks passed. Browser checks covered red 12px styling, wrapping, all three languages and the secure-storage session fallback. Browser and native checks passed again after the copy correction. Native Electron checks exercised the real preload and IPC bridge and verified that the manager's actual path matched the DOM notice. The detector ran once and reported only pre-existing tells.

## Limits

The assurance concerns local storage and upload for backup. API authentication and network behavior are unchanged: API requests still send the key to the configured provider. Earlier AI settings and prompt documentation remains historical; this record describes the current key notice. Missing `DESIGN.md` and the obsolete `PRODUCT.md` Register entry are pre-existing documentation drift outside this narrow edit. The screenshots establish the reviewed form states; they do not constitute a broader design or security audit.
