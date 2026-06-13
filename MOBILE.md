# Mobile (v4) — Capacitor migration

FLUX ships as a web app; the mobile app is the **same** Svelte/Vite build wrapped
with [Capacitor](https://capacitorjs.com/) in a native WebView. No native rewrite.

This file is the runbook. Work lives on the `feature/ai-proxy` branch until the
mobile path is validated, then merges to `main`.

---

## Prerequisite: the AI proxy must be deployed

The AI assistant is **cloud-gated** — it calls Anthropic through the
`anthropic-proxy` Supabase Edge Function, which holds the API key server-side.
On mobile this is non-negotiable (a client-bundled key is extractable from an
app bundle). Everything else (projection, manual editing, wizard) works fully
offline and signed-out.

Deploy / update the proxy:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   # one time
supabase functions deploy anthropic-proxy
```

The function is pinned to `verify_jwt = false` (see `supabase/config.toml`) —
it does its own auth via `getUser(jwt)` and returns CORS on every response,
which the project's new-format keys require. See
`supabase/functions/anthropic-proxy/index.ts`.

---

## Two build targets, one source tree

FLUX builds into two targets selected by Vite `--mode`. Same Svelte source; the
active target is exposed to the app as the compile-time constant `__PLATFORM__`
(see `src/lib/platform.js`, re-exported as `isMobile` / `isWeb`) so layout/UX can
diverge per platform — e.g. the topbar drops the brand and spreads its controls
on mobile, keeps the `FLUX` wordmark on web.

| | Web / PWA (desktop) | Mobile (Capacitor) |
|---|---|---|
| Dev | `npm run dev` | `npm run dev:mobile` |
| Build | `npm run build` → `dist/` | `npm run build:mobile` → `dist-mobile/` |
| `base` | `/` | `./` (native WebView origin) |
| `__PLATFORM__` | `'web'` | `'mobile'` |

`build:mobile` is what Capacitor consumes (`webDir: dist-mobile`). Convenience
scripts: `npm run sync:ios` (build:mobile + `cap sync ios`) and `npm run run:ios`
(+ `cap run ios`). A Svelte `{#if isMobile}` branch still ships in both bundles —
the constant decides which *renders*, not which is included.

---

## Phase 1 — web-side prep (DONE, platform-agnostic)

Already committed on this branch. No native tooling, no store, fully reversible:

- **Capacitor installed**: `@capacitor/core`, `@capacitor/preferences` (runtime),
  `@capacitor/cli` (dev).
- **`capacitor.config.ts`**: `appId: com.rolandvelunta.flux` (placeholder —
  changeable until first publish), `appName: FLUX`, `webDir: dist-mobile`.
- **Per-target Vite `base`**: `./` (relative) for the mobile build under the native
  WebView origin (`capacitor://localhost` / `file://`), `/` for the web build.
- **Session storage**: `src/lib/supabase.js` uses `@capacitor/preferences` on
  native (the WebView can evict localStorage and drop the session) and default
  localStorage on web, gated by `Capacitor.isNativePlatform()`.

---

## Phase 2 — native build (needs a toolchain you install)

Nothing here touches the app store. Simulators need no account; running on your
own device needs only a free Apple ID (iOS) or USB debugging (Android).

### iOS (Mac)

1. Install **Xcode** (App Store, ~10GB) and CocoaPods:
   ```bash
   sudo gem install cocoapods
   ```
2. Add the platform:
   ```bash
   npm install @capacitor/ios
   npx cap add ios
   ```
3. Build the mobile target and copy it into the native project:
   ```bash
   npm run sync:ios          # = npm run build:mobile && cap sync ios
   ```
   (Re-run `npm run sync:ios` after every web change.)
4. Open and run in the Simulator:
   ```bash
   npx cap open ios   # then press ▶ in Xcode
   ```

### Android

1. Install **Android Studio** + a JDK; set `ANDROID_HOME`.
2. `npm install @capacitor/android && npx cap add android`
3. `npm run build:mobile && npx cap sync`
4. `npx cap open android` → run on an emulator or USB device.

---

## Native-only validation (do on a real device / simulator)

Layout is covered by `npm run shots` (Playwright at phone widths — see
`scripts/mobile-shots.mjs`). These can only be checked on the real thing:

- **AI chat with the keyboard up** — the iOS keyboard shrinks the viewport;
  confirm the input row + Send stay visible and aren't hidden behind it.
- **Safe-area insets** — notch / home indicator (we set `env(safe-area-inset-*)`;
  verify on a notched device).
- **Touch targets** — the small ✎ / × controls in the scenario dropdown.
- **Session persistence** — sign in, force-quit, reopen; confirm you're still
  signed in (validates the Preferences storage adapter).

---

## Notes / gotchas

- `ios/` and `android/` are generated native projects — when added, gitignore
  their build artifacts (Pods, `build/`, `.gradle`) but commit the project shells.
- OAuth / magic-link redirects (if added later) need the `capacitor://` scheme
  registered in Supabase Auth → URL Configuration. Email+password needs nothing.
- The proxy's CORS is `*`, which already covers the `capacitor://localhost`
  origin — no change needed for mobile.
