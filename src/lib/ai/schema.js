// JSON schema for the model's submit_scenario tool. The model emits friendly
// account NAMES for from/to references; convertToScenario() resolves those to
// generated IDs and normalises period codes / external flags.

export const ACCOUNT_TYPES = [
  'checking', 'savings', 'retirement', 'hsa', 'brokerage',
  'property', 'crypto', 'debt', 'income-source', 'tax', 'expense',
];

export const PERIODS = [
  'monthly', 'biweekly', 'semi-monthly', 'weekly', 'annual', 'quarterly', 'once',
];

export const CATEGORIES = [
  'income', 'tax', 'benefits', 'retirement-contrib', 'housing', 'auto',
  'insurance', 'debt', 'utility', 'subscription', 'transfer',
  'savings', 'investment', 'other',
];

const PERIOD_CODE = {
  monthly: 'monthly',
  biweekly: '14',
  'semi-monthly': 'semi-monthly',
  weekly: '7',
  annual: 'annual',
  quarterly: 'quarterly',
  once: 'once',
};

export const SCENARIO_SCHEMA = {
  type: 'object',
  properties: {
    accounts: {
      type: 'array',
      description: 'All accounts the user mentioned. Includes external buckets (income sources, tax, expense categories).',
      items: {
        type: 'object',
        properties: {
          name:       { type: 'string', description: 'Display name. Must be unique within this scenario.' },
          type:       { type: 'string', enum: ACCOUNT_TYPES },
          balance:    { type: 'number', description: 'Current balance. Use 0 for external buckets. Debts must be negative.' },
          annualRate: { type: 'number', description: 'Annual interest/growth rate as a decimal (0.045 for 4.5%). 0 for external buckets and accounts without a defined rate.' },
        },
        required: ['name', 'type', 'balance', 'annualRate'],
      },
    },
    flows: {
      type: 'array',
      description: 'All recurring transfers between accounts.',
      items: {
        type: 'object',
        properties: {
          name:     { type: 'string' },
          from:     { type: 'string', description: 'Source account name (must match an account in accounts[].name).' },
          to:       { type: 'string', description: 'Destination account name (must match an account in accounts[].name).' },
          amount:   { type: 'number', description: 'Per-payment amount, not monthlised. Use the period field to indicate cadence.' },
          period:   { type: 'string', enum: PERIODS },
          category: { type: 'string', enum: CATEGORIES },
        },
        required: ['name', 'from', 'to', 'amount', 'period', 'category'],
      },
    },
  },
  required: ['accounts', 'flows'],
};

export const SUBMIT_SCENARIO_TOOL = {
  name: 'submit_scenario',
  description: 'Call this when you have gathered enough information about the user\'s finances to populate their accounts and flows. Do NOT call this on the first turn — first ask a few clarifying questions if the user\'s initial description is sparse.',
  input_schema: SCENARIO_SCHEMA,
};

// Account/flow shapes for edits — narrower than the full submit_scenario schema.
const ACCOUNT_ADD_SHAPE = {
  type: 'object',
  properties: {
    name:       { type: 'string' },
    type:       { type: 'string', enum: ACCOUNT_TYPES },
    balance:    { type: 'number' },
    annualRate: { type: 'number' },
  },
  required: ['name', 'type', 'balance', 'annualRate'],
};

const FLOW_ADD_SHAPE = {
  type: 'object',
  properties: {
    name:     { type: 'string' },
    from:     { type: 'string', description: 'Source account name (existing or just-added).' },
    to:       { type: 'string', description: 'Destination account name (existing or just-added).' },
    amount:   { type: 'number' },
    period:   { type: 'string', enum: PERIODS },
    category: { type: 'string', enum: CATEGORIES },
  },
  required: ['name', 'from', 'to', 'amount', 'period', 'category'],
};

const ACCOUNT_PATCH_SHAPE = {
  type: 'object',
  description: 'Only include fields that should change.',
  properties: {
    name:       { type: 'string' },
    type:       { type: 'string', enum: ACCOUNT_TYPES },
    balance:    { type: 'number' },
    annualRate: { type: 'number' },
  },
};

const FLOW_PATCH_SHAPE = {
  type: 'object',
  description: 'Only include fields that should change.',
  properties: {
    name:     { type: 'string' },
    from:     { type: 'string' },
    to:       { type: 'string' },
    amount:   { type: 'number' },
    period:   { type: 'string', enum: PERIODS },
    category: { type: 'string', enum: CATEGORIES },
    enabled:  { type: 'boolean' },
  },
};

// Single edit tool the model fills out with whatever combination of changes apply.
// One tool call per turn = one preview-and-approve cycle for the user.
export const APPLY_EDITS_TOOL = {
  name: 'apply_edits',
  description: 'Apply a batch of edits to the user\'s active scenario. Use this when the user asks you to add, change, or remove accounts or flows. Include only the operations actually needed — empty arrays for the others. The user will see a preview before any change is applied.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'One-sentence plain-English summary of the changes for the user.' },
      add_accounts: { type: 'array', items: ACCOUNT_ADD_SHAPE },
      add_flows: { type: 'array', items: FLOW_ADD_SHAPE },
      modify_accounts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            target: { type: 'string', description: 'Name of the existing account to modify.' },
            patch:  ACCOUNT_PATCH_SHAPE,
          },
          required: ['target', 'patch'],
        },
      },
      modify_flows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            target: { type: 'string', description: 'Name of the existing flow to modify.' },
            patch:  FLOW_PATCH_SHAPE,
          },
          required: ['target', 'patch'],
        },
      },
      delete_accounts: { type: 'array', items: { type: 'string' }, description: 'Names of accounts to delete. Flows referencing them are dropped too.' },
      delete_flows:    { type: 'array', items: { type: 'string' }, description: 'Names of flows to delete.' },
    },
    required: ['summary'],
  },
};

// Summarize the scenario for the system prompt context in edit mode. Compact
// so it caches well and doesn't bloat the prompt.
export function summarizeScenario(scenario) {
  if (!scenario) return '(no active scenario)';
  const accts = (scenario.accounts ?? []).map((a) => {
    const bal = a.external ? '(external)' : `$${a.balance.toLocaleString()}`;
    const rate = a.annualRate ? ` ${(a.annualRate * 100).toFixed(2)}%` : '';
    return `- ${a.name}: ${a.type} ${bal}${rate}`;
  }).join('\n');
  const flows = (scenario.flows ?? []).map((f) => {
    const fromName = scenario.accounts.find((a) => a.id === f.from)?.name ?? '?';
    const toName   = scenario.accounts.find((a) => a.id === f.to)?.name ?? '?';
    const enabled = f.enabled ? '' : ' (disabled)';
    return `- ${f.name}: ${fromName} → ${toName}, $${f.amount}/${f.period}, ${f.category}${enabled}`;
  }).join('\n');
  return `ACCOUNTS:\n${accts || '(none)'}\n\nFLOWS:\n${flows || '(none)'}`;
}

export function convertToScenario(llmOutput, startDate) {
  const today = new Date().toISOString().slice(0, 10);
  const asOf = startDate || today;

  const counters = {};
  const nid = (prefix) => {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    return `${prefix}-${counters[prefix]}-${Math.random().toString(36).slice(2, 6)}`;
  };

  const EXTERNAL_TYPES = new Set(['income-source', 'tax', 'expense']);

  const accounts = (llmOutput.accounts ?? []).map((a) => {
    const external = EXTERNAL_TYPES.has(a.type);
    let balance = Number(a.balance) || 0;
    if (a.type === 'debt' && balance > 0) balance = -balance;
    return {
      id: nid('a-' + (a.type === 'income-source' ? 'inc' : a.type.slice(0, 3))),
      name: a.name?.trim() || 'Unnamed',
      type: a.type,
      balance: external ? 0 : balance,
      asOf,
      external,
      annualRate: Number(a.annualRate) || 0,
    };
  });

  const nameToId = new Map();
  for (const a of accounts) nameToId.set(a.name.toLowerCase(), a.id);

  const flows = [];
  const issues = [];
  for (const f of llmOutput.flows ?? []) {
    const fromId = nameToId.get((f.from ?? '').toLowerCase());
    const toId   = nameToId.get((f.to ?? '').toLowerCase());
    if (!fromId || !toId) {
      issues.push(`Skipped flow "${f.name}" — unknown account "${!fromId ? f.from : f.to}".`);
      continue;
    }
    flows.push({
      id: nid('f'),
      name: f.name?.trim() || 'Unnamed',
      from: fromId,
      to: toId,
      amount: Number(f.amount) || 0,
      period: PERIOD_CODE[f.period] ?? 'monthly',
      start: asOf,
      end: null,
      category: CATEGORIES.includes(f.category) ? f.category : 'other',
      group: null,
      enabled: true,
    });
  }

  return { accounts, flows, issues };
}
