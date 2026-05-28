// Wizard templates. Each template has:
//   id, label, description
//   questions: [{ id, label, type, default, hint?, prefix?, suffix?, options?, optional?, min?, step? }]
//   build(answers, ctx) → { accounts, flows }   (ctx.startDate is the simulation start)
//
// Adding a template = appending one object to TEMPLATES.

const today = () => new Date().toISOString().slice(0, 10);

function makeIdGen() {
  const counters = {};
  return (prefix) => {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    return `${prefix}-${counters[prefix]}-${Math.random().toString(36).slice(2, 6)}`;
  };
}

// Shared partials so the three templates stay consistent.
function payrollAccounts(nid) {
  return {
    employer: { id: nid('x-employer'), name: 'Employer Payroll', type: 'income-source', balance: 0, asOf: today(), external: true, annualRate: 0 },
    fedtax:   { id: nid('x-fedtax'),   name: 'Federal Tax',     type: 'tax',           balance: 0, asOf: today(), external: true, annualRate: 0 },
    statetax: { id: nid('x-statetax'), name: 'State Tax',       type: 'tax',           balance: 0, asOf: today(), external: true, annualRate: 0 },
    fica:     { id: nid('x-fica'),     name: 'FICA',            type: 'tax',           balance: 0, asOf: today(), external: true, annualRate: 0 },
  };
}

function payrollFlows(nid, payroll, chk, retirement, a, startDate) {
  const period = a.payFreq;
  const start = startDate;
  const group = 'employer';
  const flows = [
    { id: nid('f'), name: 'Net Pay',        from: payroll.employer.id, to: chk.id,             amount: +a.netPay,    period, start, end: null, category: 'income', group, enabled: true },
  ];
  if (+a.fedTax > 0)   flows.push({ id: nid('f'), name: 'Federal Tax', from: payroll.employer.id, to: payroll.fedtax.id,   amount: +a.fedTax,   period, start, end: null, category: 'tax', group, enabled: true });
  if (+a.stateTax > 0) flows.push({ id: nid('f'), name: 'State Tax',   from: payroll.employer.id, to: payroll.statetax.id, amount: +a.stateTax, period, start, end: null, category: 'tax', group, enabled: true });
  if (+a.fica > 0)     flows.push({ id: nid('f'), name: 'FICA',        from: payroll.employer.id, to: payroll.fica.id,     amount: +a.fica,     period, start, end: null, category: 'tax', group, enabled: true });
  if (retirement && +a.retirement > 0) {
    flows.push({ id: nid('f'), name: 'Retirement Contribution', from: payroll.employer.id, to: retirement.id, amount: +a.retirement, period, start, end: null, category: 'retirement-contrib', group, enabled: true });
  }
  return flows;
}

const sharedPayrollQuestions = [
  { id: 'payFreq', label: 'Pay frequency', type: 'radio', default: '14',
    options: [
      { value: '14', label: 'Biweekly' },
      { value: 'semi-monthly', label: 'Semi-monthly (1st & 15th)' },
      { value: 'monthly', label: 'Monthly' },
    ] },
  { id: 'netPay',     label: 'Take-home per check',  type: 'number', prefix: '$', default: 2800, hint: 'After taxes and deductions are removed' },
  { id: 'fedTax',     label: 'Federal tax per check', type: 'number', prefix: '$', default: 600, optional: true },
  { id: 'stateTax',   label: 'State tax per check',   type: 'number', prefix: '$', default: 200, optional: true },
  { id: 'fica',       label: 'FICA per check',        type: 'number', prefix: '$', default: 250, optional: true },
  { id: 'retirement', label: 'Retirement contribution per check', type: 'number', prefix: '$', default: 0, optional: true, hint: '401(k) / IRA / etc. Use 0 if none.' },
];

const sharedAccountsQuestions = [
  { id: 'chkBalance', label: 'Checking balance',  type: 'number', prefix: '$', default: 5000 },
  { id: 'savBalance', label: 'Savings balance',   type: 'number', prefix: '$', default: 0, optional: true },
];

const sharedExpenseQuestions = [
  { id: 'utilities',     label: 'Utilities per month',     type: 'number', prefix: '$', default: 180, optional: true },
  { id: 'groceries',     label: 'Groceries per month',     type: 'number', prefix: '$', default: 400, optional: true },
  { id: 'subscriptions', label: 'Subscriptions per month', type: 'number', prefix: '$', default: 50,  optional: true },
];

function buildExpenseFlows(nid, chk, a, startDate) {
  const flows = [];
  const externals = {};
  const addExternal = (key, name) => {
    if (!externals[key]) externals[key] = { id: nid(`x-${key}`), name, type: 'expense', balance: 0, asOf: today(), external: true, annualRate: 0 };
    return externals[key];
  };
  if (+a.utilities > 0) {
    const ext = addExternal('utilities', 'Utilities');
    flows.push({ id: nid('f'), name: 'Utilities', from: chk.id, to: ext.id, amount: +a.utilities, period: 'monthly', start: startDate, end: null, category: 'utility', group: null, enabled: true });
  }
  if (+a.groceries > 0) {
    const ext = addExternal('groceries', 'Groceries');
    flows.push({ id: nid('f'), name: 'Groceries', from: chk.id, to: ext.id, amount: +a.groceries, period: 'monthly', start: startDate, end: null, category: 'other', group: null, enabled: true });
  }
  if (+a.subscriptions > 0) {
    const ext = addExternal('subs', 'Subscriptions');
    flows.push({ id: nid('f'), name: 'Subscriptions', from: chk.id, to: ext.id, amount: +a.subscriptions, period: 'monthly', start: startDate, end: null, category: 'subscription', group: null, enabled: true });
  }
  return { flows, externals: Object.values(externals) };
}

export const TEMPLATES = [
  {
    id: 'w2-renter',
    label: 'W-2 employee, renting',
    description: 'Salaried job, rent, no mortgage. Common starting point.',
    questions: [
      ...sharedPayrollQuestions,
      ...sharedAccountsQuestions,
      { id: 'rent', label: 'Monthly rent', type: 'number', prefix: '$', default: 2200 },
      ...sharedExpenseQuestions,
    ],
    build(a, ctx) {
      const nid = makeIdGen();
      const startDate = ctx.startDate;

      const chk = { id: nid('a-chk'), name: 'Checking', type: 'checking', balance: +a.chkBalance, asOf: startDate, external: false, annualRate: 0 };
      const accounts = [chk];

      let sav = null;
      if (+a.savBalance > 0) {
        sav = { id: nid('a-sav'), name: 'Savings', type: 'savings', balance: +a.savBalance, asOf: startDate, external: false, annualRate: 0.045 };
        accounts.push(sav);
      }

      let retirement = null;
      if (+a.retirement > 0) {
        retirement = { id: nid('a-ret'), name: 'Retirement', type: 'retirement', balance: 0, asOf: startDate, external: false, annualRate: 0.07 };
        accounts.push(retirement);
      }

      const payroll = payrollAccounts(nid);
      accounts.push(payroll.employer, payroll.fedtax, payroll.statetax, payroll.fica);

      const xRent = { id: nid('x-rent'), name: 'Landlord', type: 'expense', balance: 0, asOf: startDate, external: true, annualRate: 0 };
      accounts.push(xRent);

      const flows = [
        ...payrollFlows(nid, payroll, chk, retirement, a, startDate),
        { id: nid('f'), name: 'Rent', from: chk.id, to: xRent.id, amount: +a.rent, period: 'monthly', start: startDate, end: null, category: 'housing', group: null, enabled: true },
      ];

      const { flows: extraFlows, externals } = buildExpenseFlows(nid, chk, a, startDate);
      accounts.push(...externals);
      flows.push(...extraFlows);

      return { accounts, flows };
    },
  },

  {
    id: 'w2-homeowner',
    label: 'W-2 employee, homeowner',
    description: 'Salaried job + property with mortgage. Linked debt → asset for equity tracking.',
    questions: [
      ...sharedPayrollQuestions,
      ...sharedAccountsQuestions,
      { id: 'homeValue',    label: 'Home market value',          type: 'number', prefix: '$', default: 500000 },
      { id: 'mortgageBal',  label: 'Mortgage balance',           type: 'number', prefix: '$', default: 380000, hint: 'How much you still owe (entered as a positive number)' },
      { id: 'mortgageRate', label: 'Mortgage rate',              type: 'number', suffix: '%', default: 6.5, step: 0.01 },
      { id: 'mortgagePI',   label: 'Monthly P&I payment',        type: 'number', prefix: '$', default: 2400, hint: 'Principal + interest only' },
      { id: 'escrow',       label: 'Monthly escrow (tax + ins)', type: 'number', prefix: '$', default: 600,  optional: true },
      { id: 'hoa',          label: 'HOA per month',              type: 'number', prefix: '$', default: 0,    optional: true },
      ...sharedExpenseQuestions,
    ],
    build(a, ctx) {
      const nid = makeIdGen();
      const startDate = ctx.startDate;

      const chk = { id: nid('a-chk'), name: 'Checking', type: 'checking', balance: +a.chkBalance, asOf: startDate, external: false, annualRate: 0 };
      const accounts = [chk];

      let sav = null;
      if (+a.savBalance > 0) {
        sav = { id: nid('a-sav'), name: 'Savings', type: 'savings', balance: +a.savBalance, asOf: startDate, external: false, annualRate: 0.045 };
        accounts.push(sav);
      }

      let retirement = null;
      if (+a.retirement > 0) {
        retirement = { id: nid('a-ret'), name: 'Retirement', type: 'retirement', balance: 0, asOf: startDate, external: false, annualRate: 0.07 };
        accounts.push(retirement);
      }

      const payroll = payrollAccounts(nid);
      accounts.push(payroll.employer, payroll.fedtax, payroll.statetax, payroll.fica);

      const property = { id: nid('a-property'), name: 'Home (Market)', type: 'property', balance: +a.homeValue, asOf: startDate, external: false, annualRate: 0.03 };
      accounts.push(property);

      const mortgage = { id: nid('a-mortgage'), name: 'Mortgage', type: 'debt', balance: -Math.abs(+a.mortgageBal), asOf: startDate, external: false, annualRate: (+a.mortgageRate) / 100, zeroCap: true, linkedTo: property.id };
      accounts.push(mortgage);

      const flows = [
        ...payrollFlows(nid, payroll, chk, retirement, a, startDate),
        { id: nid('f'), name: 'Mortgage P&I', from: chk.id, to: mortgage.id, amount: +a.mortgagePI, period: 'monthly', start: startDate, end: null, category: 'housing', group: 'mortgage', enabled: true },
      ];

      if (+a.escrow > 0) {
        const xEscrow = { id: nid('x-escrow'), name: 'Escrow / Prop Tax', type: 'expense', balance: 0, asOf: startDate, external: true, annualRate: 0 };
        accounts.push(xEscrow);
        flows.push({ id: nid('f'), name: 'Escrow / Prop Tax', from: chk.id, to: xEscrow.id, amount: +a.escrow, period: 'monthly', start: startDate, end: null, category: 'housing', group: 'mortgage', enabled: true });
      }
      if (+a.hoa > 0) {
        const xHoa = { id: nid('x-hoa'), name: 'HOA', type: 'expense', balance: 0, asOf: startDate, external: true, annualRate: 0 };
        accounts.push(xHoa);
        flows.push({ id: nid('f'), name: 'HOA', from: chk.id, to: xHoa.id, amount: +a.hoa, period: 'monthly', start: startDate, end: null, category: 'housing', group: 'mortgage', enabled: true });
      }

      const { flows: extraFlows, externals } = buildExpenseFlows(nid, chk, a, startDate);
      accounts.push(...externals);
      flows.push(...extraFlows);

      return { accounts, flows };
    },
  },

  {
    id: 'blank',
    label: 'Start from scratch',
    description: 'Just one checking account with the balance you enter. Add the rest manually.',
    questions: [
      { id: 'chkName',    label: 'Account name',     type: 'text',   default: 'Checking' },
      { id: 'chkBalance', label: 'Starting balance', type: 'number', prefix: '$', default: 1000 },
    ],
    build(a, ctx) {
      const nid = makeIdGen();
      const chk = { id: nid('a-chk'), name: a.chkName?.trim() || 'Checking', type: 'checking', balance: +a.chkBalance, asOf: ctx.startDate, external: false, annualRate: 0 };
      return { accounts: [chk], flows: [] };
    },
  },
];
