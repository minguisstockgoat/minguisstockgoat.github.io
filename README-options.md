# Options Compass on GitHub Pages

Live: https://minguisstockgoat.github.io/options-compass/

The existing Korean and overseas UI is built as a static React/Vite app under `options-compass/`. The hub links to it from the flow section. All market data, including US data restricted to personal use, is gzip-compressed and AES-256-GCM encrypted. The browser derives the key using PBKDF2-SHA256 (310,000 iterations) and the owner's generated high-entropy password. The password and API/service credentials are never included in source, browser assets, URLs, or logs. Only non-sensitive publication and source dates are public. The browser holds its non-extractable decryption key in memory and forgets it on reload or lock.

## Rebuild

`cd options-compass-src && npm ci && npm run build`

Source was copied from the existing private Site UI. Rebuild after changing these client files; preserve `options-compass/data/`. The Pages adapter serves the decrypted snapshot to the unchanged charts, filters, expiry controls, CSV download, themes, and educational tools. Browser refresh buttons check the latest published snapshot; they do not call private upstream APIs. The latest data keeps its original trading dates and collection timestamps.

## Refresh

`scripts/export-options.mjs` uses the existing owner-private service endpoint to update/read Korean data, 17 overseas markets, observation history, and the day's order-flow snapshot. It never calls any report, Telegram, trading, or billing endpoint. The source's free US quota and date caches remain authoritative. Missing new values preserve the source's last valid date. A rollback of the Korean date aborts publication; individual overseas date rollback preserves the preceding valid market. A failed export leaves the live deployment unchanged. An unchanged snapshot reuses its preceding ciphertext to avoid unnecessary commits.

`scripts/publish-options.py` runs through the installed Mac launch agent `com.wondaehan.options-pages`. It checks every 15 minutes, publishes at most every 30 minutes during Korean market hours and hourly outside those hours on market weekdays, and pushes only the two encrypted snapshot/status files. Existing root Pages branch publishing is preserved. The Mac must be online for updates; any computer can read the last published snapshot while it is off. Existing Telegram schedules are independent and unchanged.

The updater uses credentials already stored outside this public repository under the private Site's `.sites-runtime/`. GitHub credentials are supplied by the existing local credential helper. No new credential is stored on GitHub. GitHub's currently configured token cannot manage Actions secrets, so no cloud updater or secrets-dependent workflow is enabled.

## Access

The generated password and owner-only access instructions live under the private Site's ignored `.sites-runtime/pages/`. Do not publish them. All devices must use the same password. Do not share it or the decrypted market data, because MarketData self-service licenses prohibit redistribution: https://www.marketdata.app/docs/account/data-policies/data-redistribution/
