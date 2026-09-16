# Numbers — Mental Math Drills

Static PWA. No build step — just push and enable Pages.

## Deploy to GitHub Pages

1. Create a new GitHub repo (e.g. `numbers-math-game`).
2. Push these files to the repo root (or to a `docs/` folder — your choice):
   - `index.html`
   - `manifest.json`
   - `sw.js`
   - `icons/` (icon-192.png, icon-512.png, icon-512-maskable.png, apple-touch-icon.png)
   - `favicon.ico`
3. On GitHub: **Settings → Pages → Source** → pick the branch (e.g. `main`) and folder (`/root` or `/docs`) → Save.
4. GitHub gives you a URL like `https://<username>.github.io/<repo-name>/`. It can take a minute or two to go live.

## Installing it as an app

- **Android (Chrome):** open the URL → menu (⋮) → "Install app" / "Add to Home screen".
- **iPhone (Safari):** open the URL → Share icon → "Add to Home Screen". (iOS requires Safari specifically — Chrome on iOS can't install PWAs.)
- **Desktop (Chrome/Edge):** an install icon (⊕) appears in the address bar.

## Updating the site later

Whenever you change `index.html` (or anything else), also bump `CACHE_VERSION` in `sw.js` (e.g. `numbers-v1` → `numbers-v2`). This forces installed devices to fetch the new version instead of serving a stale cached copy. Then just push to GitHub — Pages redeploys automatically in ~1 minute.

## Notes

- All game data (history, config) is stored in the browser's `localStorage`, per-device. There's no server/backend, so progress doesn't sync across devices.
- The service worker caches the app shell so it opens even with no signal; if you're online, it always checks for a fresh version first.
