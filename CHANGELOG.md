# Changelog

## [Unreleased] — `feature/ai-proxy` branch

### Added
- **Two build targets from one source tree** — `npm run build` builds the desktop web/PWA app (`dist/`, `base: /`); `npm run build:mobile` builds the Capacitor target (`dist-mobile/`, `base: ./`), selected via Vite `--mode`. The active target is exposed as the compile-time constant `__PLATFORM__` (`src/lib/platform.js` → `isMobile`/`isWeb`) so layout/UX can diverge per platform. First divergence: the topbar drops the `FLUX` wordmark and spreads its controls evenly on mobile, keeps the wordmark + grouped cluster on web. Convenience scripts `dev:mobile`, `sync:ios`, `run:ios`. See [MOBILE.md](MOBILE.md).

## 3.14.0 — 2026-06-11

### Added
- **Light/dark theme.** Light is now the default; a ☾/☀ toggle in the topbar switches modes and the choice persists in `localStorage` (`flux_theme`). An inline script in `index.html` applies the saved theme before first paint (anti-FOUC). State + a `cssVar()` live-color reader live in `src/lib/theme.svelte.js`; the canvas/Chart.js views (`Graph`, `Projection`, `BalanceChart`) read theme colors through it so drawing follows the active mode. The palette moved to CSS custom properties under `:root` (light) and `[data-theme="dark"]`, with new `--shadow`/`--overlay` tokens.
- **AI proxy** — the Anthropic key now lives server-side in the `anthropic-proxy` Supabase Edge Function (`supabase/functions/anthropic-proxy/`), not in the client bundle. The client calls the proxy with the user's Supabase access token; the proxy verifies the user (`getUser`) and forwards to Anthropic. Pinned `verify_jwt = false` (the function does its own auth + CORS, required for the project's new-format keys).
- **Capacitor web-side prep** (mobile v4, Phase 1) — `@capacitor/core` + `preferences` + `cli`, `capacitor.config.ts`, Vite `base: './'` for relative asset URLs, and Supabase session storage backed by `@capacitor/preferences` on native. See [MOBILE.md](MOBILE.md).

### Changed (behavior)
- **AI now requires sign-in** (cloud-only via the proxy). The rest of the app stays local and works signed-out. Web dev no longer uses `VITE_ANTHROPIC_API_KEY` — deploy the proxy and set `ANTHROPIC_API_KEY` as a Supabase secret instead.

## 3.13.0 — 2026-05-28

### Added
- **Input modes for getting data in.** Three ways to populate a scenario besides manual table entry:
  - **Template wizard** (scenario menu → `+ New from template`) — pick W-2 renter / W-2 homeowner / blank, fill ~5–10 numbers, preview, apply. Templates live in `src/lib/wizard/templates.js`.
  - **AI assistant** (scenario menu → `+ Describe your finances`, or topbar `✦ AI Edit`) — conversational setup and on-demand editing via Claude Haiku 4.5. Setup uses a `submit_scenario` tool; edit uses an `apply_edits` diff tool with a preview-and-apply step. Streaming responses, markdown rendering, and a 📎 file-attach (paste or attach a CSV/statement; the model parses arbitrary/messy data and infers recurring flows from transaction registers).
- **`applyScenarioEdits(diff)`** in state — atomic add/modify/delete of accounts and flows with name→id resolution.

### Changed
- **Topbar** — removed `v3` from the title; the scenario dropdown is now grouped in the right-justified cluster instead of floating center; Export/Import moved into the account-menu dropdown (from [3.12.0]); the account menu always renders as a single trigger.

### Notes
- The AI assistant requires `VITE_ANTHROPIC_API_KEY`. **Prototype-only:** the key is currently bundled into the browser — a server-side proxy is required before any real release (and is a hard prerequisite for the mobile build).
- A WebGPU on-device LLM approach was prototyped and abandoned (consumer-Mac WebGPU buffer limits); a local CSV column-mapper was prototyped and removed in favor of the more flexible AI file-attach. See `src/lib/ai/NOTES.md`.

## 3.12.0 — 2026-05-27

### Added
- **User accounts and cross-device sync** (Supabase). Optional sign-in via email + password or magic link. When authenticated, the persisted state blob (`scenarios / activeScenarioId / compareIds / customFlowCats / flowCatDisplay / config`) is mirrored to a `public.user_data` JSONB row keyed by `auth.uid()` with Row-Level Security ensuring users only see their own row.
- **First-run banner** — soft prompt below the topbar inviting sign-in for backup/sync; one-time dismiss stored as `flux_first_run_dismissed=1`. Auto-dismissed on successful sign-in.
- **`AccountMenu` topbar widget** — `Sign in` when anonymous; `● <email> ▾` dropdown with `Sign out` when authenticated; subtle `local-only` indicator when env vars aren't configured.
- **`AuthModal`** — tabbed Sign in / Sign up with password fields plus a `Send magic link` button.
- **`ConflictModal`** — on first sign-in when both device and account have data, shows row counts for each and asks the user to pick `Keep device → upload` or `Keep account → replace device`.
- **`supabase/schema.sql`** — idempotent setup for the `user_data` table, RLS policies, and `updated_at` trigger.
- **`.env.example`** + `envDir: '..'` in `vite.config.js` so env files live at the project root next to `.gitignore` (rather than under `src/`).

### Architecture
- **Offline-first preserved.** Auth is opt-in; the app continues to work without an account, with `localStorage` as the source of truth. On sign-in, server data syncs in (or local data uploads if the server row is empty). On sign-out, localStorage stays put so the user can keep working.
- **Save pipeline** — `saveLS()` now calls an `afterSaveHook` registered by the sync layer, which debounces (800ms) an upsert to Supabase when authed. `pushNow()` exists for unconditional/immediate writes (used after conflict resolution).
- **New `state.svelte.js` exports**: `LS_KEY`, `snapshotPersisted()`, `applyPersistedShape()`, `hasLocalData()`, `setAfterSaveHook()`. `importJSON()` refactored to use `applyPersistedShape()`.
- **`isSupabaseConfigured`** flag lets the app degrade gracefully to local-only mode when env vars are missing.

### Notes
- Last-write-wins between devices for the same user (no optimistic concurrency yet — fine for the "laptop, then phone" workflow).
- Sign-out does **not** clear localStorage; if user B signs in on the same browser they'll briefly see user A's data and get the conflict prompt. Strengthen later if needed.
- Bundle size jumped from ~360KB → ~580KB (Supabase SDK). Code-splitting deferred.

## 3.11.0 — 2026-05-27

### Changed
- **Mobile pass for table-heavy tabs.** Accounts and Flows now render the desktop table at all viewport widths instead of falling back to a card grid on phones; the wrapper allows horizontal swipe when columns don't fit. The card markup is retained but hidden.
- **Scenario chips → dropdown menu.** The wrapping `+ Fork`/chip row in the topbar is replaced with a single compact `SCENARIO · <name> ▾` trigger. Open menu lists scenarios with inline rename (✎) and delete (×) controls and a `+ Fork active` action; right-click still renames as a desktop shortcut.
- **KPI ribbon → single-row strip.** The five `.kpi` cards (~80–90px tall) are replaced with a one-row `.kpi-strip` showing `Range | NW | Min | In | Out | Net`. Sub-info (Δ over horizon, savings rate, min-bal date) moved into `title=` tooltips. Strip scrolls horizontally on narrow viewports.
- **Projection range controls collapsible at all widths.** The Start/End/Span/Resolution row is now hidden behind a `Range · 12mo · monthly ▾` toggle on every viewport, not just mobile.
- **Unified Accounts/Flows toolbars.** Both tabs now use the same `.view-toolbar` layout — `[inner tabs (left)] [filters ▾] [+ Add]` — with the tabs sharing available width like a segmented control (`flex:1 1 0` each, `min-width:64px`, ellipsis on overflow). Dropped the `<h3>Flows</h3>` title and filtered-count badge. `flex-wrap:nowrap` keeps everything on one row; the toolbar scrolls horizontally as a fallback if a viewport is genuinely too narrow.
- **`.ctrl-toggle` default style is now compact** (10px font, 4×10 padding); mobile block ups it to a 34–36px touch target.

## 3.10.3 — 2026-05-25

### Changed
- **Balance-over-time chart is single-account only.** Removed multi-account selection — the picker now picks exactly one trace at a time. `Net Worth` (sum of all internal accounts) joins the list as its own selectable row. The "Individual lines / Stacked area (NW)" mode toggle is gone (no longer applicable). Compare scenarios still overlay, now as one dashed line per scenario (matching the active selection — either the same account in each compared scenario, or each scenario's NW).
- **Scheduled flows section** now shows only the selected account's schedule, with a hint to pick a specific account when NW is selected.
- **State**: `store.chartSelectedAccts: Set` replaced with `store.chartSelectedAcctId: string` (sentinel `__nw__` for Net Worth).

### Removed
- `selectAll` / `selectNone` / `selectPreset` (Liquid/NW preset buttons) and the `chartMode` state on Projection.

## 3.10.2 — 2026-05-25

### Changed
- **Account-to-account comparison for forks.** Compared scenarios no longer overlay a single NW line. Each selected account now gets one extra line per compared scenario: same color as the account (so Chase Checking stays blue across all scenarios), with each scenario getting its own dash pattern so overlapping lines stay distinguishable. If multiple accounts are selected, a `Total · <scenario>` line is also added per scenario. The picker row now previews the actual dash pattern via inline SVG so you can match it to the chart legend.

## 3.10.1 — 2026-05-25

### Changed
- **Scenario comparison toggle moved into the chart's account picker.** The ●/○ indicator on each topbar chip is removed; instead, the existing "Individual lines / X accounts ▾" dropdown on the Projection chart now has a `Compare scenarios` section below the accounts list with one checkbox per non-active scenario (dashed-line color preview matches the overlay color). Folds two related selection concerns — which accounts, which scenarios — into one place. Topbar chips now do switch / rename / delete only.

## 3.10.0 — 2026-05-25

### Added
- **Scenarios (phase 2): compare scenarios visually.** Each non-active chip in the topbar now has a small ●/○ toggle — click it to overlay that scenario on the Projection chart and Net Worth Breakdown.
  - **Projection chart**: each compared scenario appears as one dashed line tracking total net worth across the projection range (distinct color per scenario, labeled in the legend).
  - **Net Worth Breakdown**: a comparison block appears at the top of the panel showing each scenario's final net worth and the delta vs the active scenario. Per-account breakdown remains single-scenario (active) below.
- `simulate()` now runs sims for every compared scenario in addition to the active one, storing them in `store.compareSims`. Compare set is persisted in localStorage/JSON export.
- `deleteScenario()` auto-removes the deleted ID from `compareIds` so stale entries don't linger.

## 3.9.0 — 2026-05-25

### Added
- **Scenarios (phase 1): branch your model to test hypothetical changes.** Your `accounts` and `flows` are now wrapped in a named "Baseline" scenario; you can fork it to create independent scenarios that don't disturb the core model. Topbar scenario bar lets you switch active scenarios (click), rename (right-click), delete (× on the chip), or fork the current active scenario (`+ Fork`). The simulation engine reads from the active scenario; switching scenarios re-runs the sim.
- **Schema migration.** localStorage and JSON imports of the old `{accounts, flows}` shape auto-upgrade to `{scenarios: [{id: 'baseline', name: 'Baseline', accounts, flows}], activeScenarioId: 'baseline'}` on load — no manual export/reimport needed.

### Notes
- Date range (start / end / resolution) is global across scenarios so comparisons stay apples-to-apples.
- Editing Baseline doesn't auto-propagate to forks (intentional: each scenario is a snapshot). A "Rebase from Baseline" action may follow if drift becomes painful.
- Phase 2 (chart overlays + side-by-side Net Worth Breakdown for compared scenarios) lands next.

## 3.8.3 — 2026-05-25

### Changed
- **Flows desktop list: single table with always-visible column headers.** Same restructure as 3.8.1 applied to Accounts — all flow groups now share one `<table>`, columns (Name / From / → / To / Amount / Period / Category / actions) align across every row, and the `<thead>` is sticky at the top of the scroll region. Group rows are now full-width `<tr colspan="8">`. The `.acct-group-row` CSS class was renamed to `.tbl-group-row` so both tabs share the styling.
- **Fixed sticky `<thead>` offset.** The global `.fl-table thead th` rule had `top:46px` (stale hold-over from a layout where toolbar and table shared a scroll container) — corrected to `top:0`, removing a 46px dead band where rows could peek above the header. Removes the per-tab override that was patching this.

## 3.8.2 — 2026-05-25

### Changed
- **Accounts list: all type groups collapsed by default.** Set semantics flipped — the tracking Set now holds *expanded* groups (empty = all collapsed) instead of collapsed groups (empty = all expanded). Click a group header to expand. Lands you on a single-screen overview of every account category instead of the long scrolling list.

## 3.8.1 — 2026-05-25

### Changed
- **Accounts list: single table with sticky column header.** Previously each type group rendered its own `<table>`, so column widths varied between groups and the header was only shown in flat sort mode. Now all groups live in one `<table>` — columns align across every row by construction — and the `Name / Type / Balance` header is always visible (sticky at the top of the scroll region). Group rows are now full-width `<tr>` with `colspan="4"`; new `.acct-group-row` CSS gives them the same look as the old `.fl-group-header` divs.

## 3.8.0 — 2026-05-25

### Changed
- **Accounts List view now renders as collapsible groups + table** (same pattern as Flows). When sorted by Type (default), accounts collapse under type-headers showing `▶ TYPE  N accts  $sum` — click to expand the table of rows. Other sort modes render a single flat table with thead. External accounts get their own `▶ EXTERNAL` group at the end. Columns: name (with APR inline), type chip, balance, actions (Edit / Sched / ✕). Reuses `.fl-table` / `.fl-group-header` styles.
- **Mobile keeps cards.** Same dual-rendering as Flows — desktop sees the table, mobile (≤640px) sees the simplified `AccountCard` grid.

### Removed
- **"Projected ↓" sort option.** Sorting by a value no longer shown anywhere on the card or table row made the sort invisible. The Projection tab's Net Worth Breakdown view remains the place for ranking by projected balance.

## 3.7.1 — 2026-05-25

### Removed
- **AccountCard projection text and sparkline.** The "Projected: $X" line and the 60px-tall balance sparkline are gone. Cards now show only what's intrinsic to the account itself (name + APR, type tag, current balance, flow expander, actions) — the projected trajectory lives on the Projection tab. Frees ~75px of vertical space per card so more accounts fit on screen. `Sparkline.svelte` deleted (was only used here).

## 3.7.0 — 2026-05-25

### Changed
- **Accounts tab gains a View toggle: List · Portfolio · Linked.** Same pattern as 3.6.0 applied the Flows tab. List is the editable AccountCard grid (unchanged); Portfolio shows accounts grouped by type (Cash / Savings / Retirement / HSA / Brokerage / Real Estate / Crypto / Debt) with per-group net balance; Linked shows debt → asset pairs with equity and LTV plus an unlinked-debt fallback. Filters dropdown only appears in List mode.

### Removed
- **Linked tab and Portfolio tab.** Their content moved under Accounts → View. Top nav goes from 6 tabs to 4: Projection, Accounts, Flows, Graph.

## 3.6.0 — 2026-05-25

### Changed
- **Flows tab gains a View toggle: List · Income · Expenses.** The three were previously separate top-level tabs but are conceptually three lenses on the same flow data (List = editor, Income = per-group gross→deductions→net waterfall, Expenses = category-bar breakdown). Filters and the +Add Flow button stay on the toolbar across all three views; the filters dropdown only appears in List mode (filters don't apply to the aggregate summaries). View resets to List on tab switch (not persisted).

### Removed
- **Income tab and Expenses tab.** Their content moved under Flows → View. Top nav goes from 8 tabs to 6: Projection, Accounts, Flows, Graph, Linked, Portfolio.

## 3.5.7 — 2026-05-25

### Changed
- **Default simulation start is today.** First-run start date now uses `new Date()` instead of the hardcoded `2026-04-13`. Users with a saved config keep their existing start date.

## 3.5.6 — 2026-05-25

### Changed
- **Balance-over-time chart now shows cashflow as background bars.** Inflow (green) and outflow (red) bars render behind the balance lines on a secondary right y-axis, bucketed by the same snapshot intervals as the lines so the x-axis stays aligned by construction. Bars sum across whichever accounts are selected in the chart's account picker — transfers between selected accounts are excluded (only money entering or leaving the selected set counts). Right y-axis is scaled to ±2.2× max flow so bars stay visually subordinate to the line trace.

### Removed
- **Cash flow tab.** Its bar chart is now integrated into the Projection chart. The independent day/week/month/quarter/year resolution selector is gone — cashflow buckets follow the Projection chart's daily/weekly/monthly resolution.

## 3.5.5 — 2026-05-25

### Removed
- **Balances tab.** Its net-worth breakdown was a read-only summary of the same simulation the Projection tab already drives, so it now lives inside Projection (between the balance-over-time chart and the scheduled-flows section). The Accounts tab keeps its role as the editor for account entities; Projection is now the single surface for "what does the simulation say about my future."

## 3.5.4 — 2026-05-23

### Changed
- **Graph view fits the mobile viewport.** Canvas now flex-fills its container instead of using `calc(100vh - 140px)` (which was wrong once the KpiBanner was added). Node radii and label fonts scale with the smaller canvas dimension so the layered layout doesn't overlap on narrow screens. Device pixel ratio uses the actual `window.devicePixelRatio` (capped at 2) instead of a hardcoded 2 — fixes hit-testing on non-Retina and triple-density displays.
- **Touch support on Graph.** `touchstart` / `touchmove` / `touchend` handlers mirror the mouse handlers, so nodes can be dragged with a finger. `touch-action: none` on the canvas prevents the browser from interpreting the drag as a page scroll. Tooltip auto-flips to stay on-screen.
- **Graph toolbar collapses on mobile** like the other views. "Reset layout" stays always-visible; "Show" mode and "Amounts" toggle tuck under an "Options ▾" button.

## 3.5.3 — 2026-05-23

### Changed
- **Projection tab no longer duplicates the range info.** The KpiBanner already shows `Projection {start} → {end} · ≈ N mo` above every tab, so the matching summary on the Projection tab is removed. The "Range ▾" mobile toggle moves into its own minimal bar that's only rendered on mobile (desktop shows the full range/resolution controls directly).

## 3.5.2 — 2026-05-23

### Fixed
- **Schedule table no longer horizontally scrolls on mobile.** The inline `<th style="width:220px">` widths beat the previous mobile CSS rules on specificity; the column widths now use `!important`. Added explicit `overflow-x:hidden` to `.proj-scroll`, `.dash-scroll`, `.flows-wrap`, `.fl-cards`, and `.accts-grid` — when only `overflow-y:auto` is set, the spec promotes `overflow-x` from `visible` to `auto`, which was allowing wide children to bubble out.

### Removed
- **"Run Simulation" button on the Projection tab.** Simulations already auto-run on every range change, account edit, or flow edit, so the button was redundant.

## 3.5.1 — 2026-05-23

### Changed
- **No horizontal scrolling on mobile.** All tab content now fits the viewport width:
  - **Flows view renders as cards on mobile** instead of an 8-column table. Each card stacks name + amount, source → destination, category/period/group tags, and full-width action buttons.
  - **Schedule table uses fixed table-layout on mobile** with proportional column widths (36/24/20/20) and ellipsis truncation. All four columns stay visible.
- **Collapsible toolbars.** Projection, Flows, and Accounts now tuck their parameter selects and filter chips into a `.ctrl-body` that's hidden by default on mobile. Primary actions (Run Simulation, +Add Flow, +Add Account) and key summary text stay always-visible; a "Range" / "Filters (N)" toggle reveals the controls. Desktop behavior unchanged.

## 3.5.0 — 2026-05-23

### Added
- **Mobile layout pass.** App is now usable in a phone browser without horizontal page scroll, awkward overflow, or iOS focus-zoom. Specifics:
  - **Hamburger tab menu on small screens.** The 10-tab bar collapses into a single button that shows the current tab and expands to a dropdown list. Desktop tab bar is unchanged.
  - **KPI ribbon scrolls horizontally on mobile** with scroll-snap, so all 5 cards remain reachable at readable sizes instead of being crushed into a 5-column grid.
  - **iOS quality-of-life:** `viewport-fit=cover` + `env(safe-area-inset-*)` padding on the topbar and scroll containers (no clipping under the notch or home indicator), `100dvh` chrome height, inputs bumped to 16px on mobile to suppress focus-zoom, larger touch targets on nav controls.
  - **Wide tables (Flows, Schedule) scroll inside their container** instead of bubbling overflow to the page.
  - **Modals expand to 96vw on mobile** with single-column form layouts.
- **`npm run dev:lan`** script — runs Vite with `--host` so the dev server is reachable from phones on the same network (or over Tailscale).

## 3.4.0 — 2026-05-23

### Changed
- **Other tools split into per-widget tabs.** The consolidated "Other tools" tab is gone. Each of its widgets is now its own top-level tab: Balances · Cash flow · Income · Expenses · Linked · Portfolio. The KPI strip (Net Worth / Checking Min / Mo. Inflow / Mo. Outflow / Mo. Net) plus the read-only projection-range indicator are hoisted into a persistent ribbon that sits above the tab bar and is visible on every tab.

## 3.3.0 — 2026-05-12

### Added
- **Projection tab.** New default tab combining the balance-over-time chart and the scheduled-flows table under one shared simulation range. Controls live in a single consolidated toolbar: Start date, End date, Span preset (1 week / 1 month / 3 months / 6 months / 1 year / 5 years / 10 years — or "Custom"), and Resolution (daily / weekly / monthly).
- **Shared account picker across chart and schedule.** The chart's multi-select picker (with All / None / Liquid / Net Worth presets) now drives both sections. The schedule renders one collapsible table per selected account, each with its own account-color header, current balance, and rate indicator. Expand-all / collapse-all buttons fan out to every visible table.
- **Resolution-aware chart.** The balance chart now buckets `dailyBalances` to match the selected resolution — one point per day, per week, or per month — and adapts x-axis label formatting accordingly.
- **Auto-simulate on range change.** Changing the start or end date re-runs the simulation automatically; the Run Simulation button remains as a manual override.

### Changed
- **`config` model.** `store.config` is now `{ startDate, endDate, resolution }`. The old `months` field is auto-migrated to `endDate` on load. Engine takes `endDate` directly.
- **Tab structure.** Tabs reorder to: Projection (default) · Accounts · Flows · Graph · Other tools. The former Dashboard becomes "Other tools" with the balance-over-time card removed (it lives in Projection now); KPIs, account balances, cashflow chart, income waterfall, expense breakdown, linked positions, and portfolio-by-type remain. The standalone Schedule tab is gone — its table is now `components/ScheduleTable.svelte`, reused by Projection.
- **Other tools toolbar.** No longer edits the simulation range; shows a read-only "Projection X → Y · ≈ N mo" indicator pointing users to the Projection tab.
- **Cashflow chart resolution.** Now supports daily / weekly / monthly / quarterly / yearly, gated by projection length.

### Fixed
- **Graph view balances.** Internal-account node labels and tooltips now show the recorded current `account.balance` instead of the simulated end-of-period balance. Linked-pair equity is computed from current balances for consistency. External accounts still show their simulated cumulative flow-through (their meaningful value).
- **Schedule running balance.** Re-baselined to start from the recorded current account balance and accumulate the period's net flow, rather than reading the simulation's projected balance at the display range start. Interest accrual on rated accounts is no longer projected in this view and is flagged in the per-account header.

## 3.2.1

### Fixed
- **Dashboard expense breakdown** — flows that funded an expense indirectly through a debt account (mortgage P&I, auto-loan payment, credit-card payments) were being filtered out, leaving only insurance, utilities, and subscriptions visible. The breakdown now treats both external accounts and debt accounts with no outflows as expense sinks, and no longer excludes grouped flows. Mortgage P&I, Escrow, HOA, the Tacoma payment, and card payments now appear in their own categories. The rule is topology-driven: once a debt account gains outflows of its own (e.g. credit-card purchase-flows routed through it), payments into the debt account automatically demote to transfers and the leaf-bound flows carry the expense category instead.

## 3.2.0

### Added
- **Schedule tab** — new view (after Graph) with a day-to-day ledger for a single internal account. Controls: account dropdown, date-range picker, resolution selector (daily / weekly / monthly). Columns: Date, Flows, Total flow, Running balance. Partial month buckets are labeled with their day span; interest from rated accounts is reflected implicitly in the running balance on the 1st of each month.
- **Engine: `dailyBalances`** — simulation output now includes a per-day array of end-of-day internal-account balances, enabling views that need balance resolution finer than the existing `monthlySnapshots`.
