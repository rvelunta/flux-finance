# Changelog

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
