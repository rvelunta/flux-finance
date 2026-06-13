# FLUX Roadmap

Major versions are **product eras**. Minor versions (3.1, 3.2, …) are per-feature increments; patch versions are fixes.

## v3 — Feature-rich web (current)

The "visionary" era. Features the original tool never had, built on Svelte 5 + Vite.

Key themes:
- **Scenario building** — save/load/compare named configurations (e.g., "baseline" vs. "refinance at 5%")
- **Visualization improvements** — richer, more exploratory ways to understand projected cash flow

Shipped and planned work is tracked in [CHANGELOG.md](CHANGELOG.md).

## v4 — Mobile (in progress)

Capacitor-wrap the same Svelte codebase for iOS/Android. No native rewrite planned. Prerequisites: the web app's feature set is "done enough" and the UI has been validated on small screens.

Architectural choices in v3 should keep the Capacitor path open — avoid server-backend coupling and browser APIs iOS Safari doesn't support. (Two server dependencies were ultimately accepted: Supabase auth/sync, and the `anthropic-proxy` Edge Function that keeps the AI key off the client. Both are reachable from a WebView over HTTPS, so the Capacitor path stays open; the app remains fully usable offline and signed-out apart from the AI assistant.)

Migration runbook and status: see [MOBILE.md](MOBILE.md). Phase 1 (web-side Capacitor prep) is merged to `main`. Phase 2 (native build) is in progress on the `feature/ios-native` branch — the iOS Xcode project is scaffolded and runs in the Simulator; physical-device deployment is still being validated. Android scaffolding is pending an Android Studio install.
