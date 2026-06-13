// Build-time platform target, injected by Vite `define` in vite.config.js.
//   'web'    → desktop / PWA browser build  (npm run dev | build)
//   'mobile' → Capacitor native build       (npm run dev:mobile | build:mobile)
//
// __PLATFORM__ is replaced with a string literal at build time, so `isMobile` /
// `isWeb` fold to constants and each build renders only its own platform's
// layout. Note: a Svelte `{#if isMobile}` branch still ships in *both* bundles
// (the compiler wraps the condition in a closure, so the unused markup isn't
// tree-shaken) — the constant decides which branch *renders*, not which is
// included. Keep platform-divergent UI lightweight rather than assuming it's
// stripped; for heavy platform-only code, prefer a dynamic import behind the flag.
//
// This is distinct from `Capacitor.isNativePlatform()` (a *runtime* check used
// in supabase.js for native-only storage): use that when behaviour must depend
// on the actual runtime; use this for build-time layout/UX divergence.
/* global __PLATFORM__ */

export const PLATFORM = __PLATFORM__;
export const isMobile = PLATFORM === 'mobile';
export const isWeb = PLATFORM === 'web';
