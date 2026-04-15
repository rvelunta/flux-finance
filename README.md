# Cashflow Engine v2

A personal finance simulation engine built around two primitives: **accounts** (hold balances) and **flows** (directed transfers between accounts). Models income, expenses, debt, investments, and real estate with compounding interest, zero-cap debt payoff, and a force-directed flow graph.

## Architecture

### Data Model

**Accounts** come in two flavors:
- **Internal** — real accounts that hold balances and contribute to net worth (checking, savings, retirement, brokerage, crypto, property, debt)
- **External** — named endpoints outside your system that track cumulative tallies (income sources, tax sinks, expense categories). They reset to zero each simulation run.

Every account can have:
- `annualRate` — compounding rate applied monthly (growth for assets, APR for debt)
- `zeroCap` — prevents balance from crossing $0 (debt stops accruing when paid off, payment excess stays in source)
- `linkedTo` — links a debt to the asset it funds (mortgage → property) for equity/LTV tracking

**Flows** are directed transfers with a schedule:
- `from` → `to` (any account to any account)
- Amount, period (weekly/biweekly/semi-monthly/monthly/quarterly/annual/one-time)
- Start/end dates, category, optional group tag, enabled toggle

### Simulation Engine

The engine runs day-by-day over the projection period:
1. On the 1st of each month, compounds interest on all accounts with non-zero rates
2. Applies all scheduled transfers for that day
3. Enforces zero-cap constraints (clamps transfers that would cross $0)
4. All values rounded to the nearest cent

Monthly snapshots capture balances for charting. Net worth = sum of all internal account balances.

### Views

- **Dashboard** — KPIs, balance chart with account picker, NW breakdown, cashflow bars, income waterfall, expense breakdown, linked positions (debt→asset equity), portfolio by type
- **Accounts** — card grid with sparklines, flow lists, schedule viewer, filters/sort by type/balance/rate
- **Flows** — grouped table with collapsible headers, search, category chips, account/group filters, sort options
- **Graph** — force-directed canvas visualization with layered preset layout (Deductions → Income → Accounts → Expenses), draggable nodes, linked-pair connectors

## Getting Started

```bash
npm install
npm run dev
```

Opens at `http://localhost:3000`. Data persists in localStorage and can be exported/imported as JSON.

## Build

```bash
npm run build
```

Outputs to `dist/` — a static site deployable anywhere.

## Project Structure

```
cashflow-engine/
├── src/
│   ├── index.html       # App shell and modal markup
│   ├── style.css         # All styles
│   └── main.js           # Application logic
├── package.json
├── vite.config.js
├── .gitignore
├── LICENSE
└── README.md
```

## Data Format (JSON Export)

```json
{
  "version": "v2-3",
  "accounts": [
    {
      "id": "a-chk",
      "name": "Chase Checking",
      "type": "checking",
      "balance": 12425.41,
      "asOf": "2026-04-13",
      "external": false,
      "annualRate": 0,
      "zeroCap": false,
      "linkedTo": null
    }
  ],
  "flows": [
    {
      "id": "f-b1",
      "name": "Boeing Net Pay",
      "from": "x-boeing",
      "to": "a-chk",
      "amount": 5138.13,
      "period": "14",
      "start": "2024-10-22",
      "end": null,
      "category": "income",
      "group": "boeing",
      "enabled": true
    }
  ],
  "config": {
    "startDate": "2026-04-13",
    "months": 6
  }
}
```

## Account Types

| Type | Internal | Description |
|------|----------|-------------|
| `checking` | yes | Day-to-day cash |
| `savings` | yes | Savings with APY |
| `retirement` | yes | 401(k), IRA |
| `hsa` | yes | Health savings |
| `brokerage` | yes | Investment account |
| `crypto` | yes | Cryptocurrency |
| `property` | yes | Real estate (market value) |
| `debt` | yes | Liabilities (negative balance) |
| `income-source` | no | Payroll sources |
| `tax` | no | Tax withholding sinks |
| `expense` | no | Expense categories |

## Flow Periods

| Value | Meaning |
|-------|---------|
| `once` | One-time transfer |
| `7` | Weekly |
| `14` | Biweekly (26/yr) |
| `semi-monthly` | 1st and 15th (24/yr) |
| `monthly` | Monthly |
| `quarterly` | Every 3 months |
| `annual` | Yearly |

## Future Work

- Per-occurrence overrides (skip/modify individual flow instances)
- Rate schedules (ARM, promo APR, step rates)
- Scenario comparison (save/load named configurations)
- Transaction log (searchable daily ledger)
- Multi-currency support
- API integrations (Plaid, bank sync)

## License

MIT
