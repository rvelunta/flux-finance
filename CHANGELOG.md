# Changelog

## 3.2.1

### Fixed
- **Dashboard expense breakdown** — flows that funded an expense indirectly through a debt account (mortgage P&I, auto-loan payment, credit-card payments) were being filtered out, leaving only insurance, utilities, and subscriptions visible. The breakdown now treats both external accounts and debt accounts with no outflows as expense sinks, and no longer excludes grouped flows. Mortgage P&I, Escrow, HOA, the Tacoma payment, and card payments now appear in their own categories. The rule is topology-driven: once a debt account gains outflows of its own (e.g. credit-card purchase-flows routed through it), payments into the debt account automatically demote to transfers and the leaf-bound flows carry the expense category instead.

## 3.2.0

### Added
- **Schedule tab** — new view (after Graph) with a day-to-day ledger for a single internal account. Controls: account dropdown, date-range picker, resolution selector (daily / weekly / monthly). Columns: Date, Flows, Total flow, Running balance. Partial month buckets are labeled with their day span; interest from rated accounts is reflected implicitly in the running balance on the 1st of each month.
- **Engine: `dailyBalances`** — simulation output now includes a per-day array of end-of-day internal-account balances, enabling views that need balance resolution finer than the existing `monthlySnapshots`.
