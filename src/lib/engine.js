import { parseDate, fmtD, addDays, daysBetween, getOccurrences } from './dates.js';

export function runSimulation(accounts, flows, config) {
  const startDate = parseDate(config.startDate);
  const months = parseInt(config.months);
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + months);
  const totalDays = daysBetween(startDate, endDate);

  const balances = {};
  accounts.forEach((a) => { balances[a.id] = a.external ? 0 : a.balance; });

  const allTransfers = [];
  flows.filter((f) => f.enabled).forEach((f) => {
    getOccurrences(startDate, endDate, f.period, f.start, f.end).forEach((d) => {
      const ds = fmtD(d);
      const override = f.overrides?.[ds];
      if (override?.skip) return;
      const amount = override?.amount ?? f.amount;
      allTransfers.push({
        date: d, name: f.name, from: f.from, to: f.to,
        amount, category: f.category, group: f.group, flowId: f.id,
        overridden: override != null,
      });
    });
  });

  allTransfers.sort((a, b) => a.date - b.date);
  let tIdx = 0;

  const cents = (v) => Math.round(v * 100) / 100;

  const rateAccts = accounts.filter((a) => a.annualRate && a.annualRate !== 0 && !a.external);
  let lastCompoundMonth = -1;

  const zeroCapIds = new Set(accounts.filter((a) => a.zeroCap).map((a) => a.id));
  const internalIds = new Set(accounts.filter((a) => !a.external).map((a) => a.id));
  const chkId = accounts.find((a) => a.type === 'checking' && !a.external)?.id;

  let minBal = chkId ? balances[chkId] : Infinity;
  let minBalDate = startDate;
  const monthlySnapshots = [];
  let lastSnapMonth = '';

  for (let i = 0; i <= totalDays; i++) {
    const date = addDays(startDate, i);
    const ds = fmtD(date);

    const thisMonth = date.getFullYear() * 12 + date.getMonth();
    if (date.getDate() === 1 && thisMonth !== lastCompoundMonth && i > 0) {
      lastCompoundMonth = thisMonth;
      rateAccts.forEach((a) => {
        if (balances[a.id] === undefined || balances[a.id] === 0) return;
        const interest = cents(balances[a.id] * (a.annualRate / 12));
        let newBal = cents(balances[a.id] + interest);
        if (zeroCapIds.has(a.id)) {
          if (balances[a.id] < 0 && newBal > 0) newBal = 0;
          else if (balances[a.id] > 0 && newBal < 0) newBal = 0;
        }
        balances[a.id] = newBal;
      });
    }

    while (tIdx < allTransfers.length && fmtD(allTransfers[tIdx].date) === ds) {
      const t = allTransfers[tIdx];
      let amt = cents(t.amount);

      if (zeroCapIds.has(t.to) && balances[t.to] !== undefined) {
        if (balances[t.to] === 0) { amt = 0; }
        else {
          const newBal = cents(balances[t.to] + amt);
          if (balances[t.to] < 0 && newBal > 0) amt = cents(-balances[t.to]);
          else if (balances[t.to] > 0 && newBal < 0) amt = cents(balances[t.to]);
        }
      }

      if (zeroCapIds.has(t.from) && balances[t.from] !== undefined) {
        if (balances[t.from] === 0) { amt = 0; }
        else {
          const newBal = cents(balances[t.from] - amt);
          if (balances[t.from] > 0 && newBal < 0) amt = cents(balances[t.from]);
          else if (balances[t.from] < 0 && newBal > 0) amt = cents(-balances[t.from]);
        }
      }

      if (balances[t.from] !== undefined) balances[t.from] = cents(balances[t.from] - amt);
      if (balances[t.to] !== undefined) balances[t.to] = cents(balances[t.to] + amt);
      tIdx++;
    }

    if (chkId && balances[chkId] < minBal) { minBal = balances[chkId]; minBalDate = date; }

    const mk = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
    if (mk !== lastSnapMonth) {
      if (lastSnapMonth) {
        monthlySnapshots.push({
          month: lastSnapMonth,
          date: addDays(date, -1),
          balances: { ...balances },
          netWorth: Object.entries(balances)
            .filter(([id]) => internalIds.has(id))
            .reduce((s, [, v]) => s + v, 0),
        });
      }
      lastSnapMonth = mk;
    }
  }

  if (lastSnapMonth) {
    monthlySnapshots.push({
      month: lastSnapMonth,
      date: endDate,
      balances: { ...balances },
      netWorth: Object.entries(balances)
        .filter(([id]) => internalIds.has(id))
        .reduce((s, [, v]) => s + v, 0),
    });
  }

  return {
    allTransfers,
    monthlySnapshots,
    startDate,
    endDate,
    minBal,
    minBalDate,
    finalBalances: { ...balances },
  };
}
