export const fmt0 = (n) =>
  '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

export const fmt2 = (n) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtAbs2 = (n) =>
  '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtShort = (v) => {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(1) + 'M';
  if (abs >= 1000) return sign + '$' + (abs / 1000).toFixed(0) + 'k';
  return sign + '$' + abs;
};

export const toMonthlyAmt = (fl) => {
  const a = fl.amount;
  const p = fl.period;
  if (p === 'monthly') return a;
  if (p === 'semi-monthly') return a * 2;
  if (p === 'quarterly') return a / 3;
  if (p === 'annual') return a / 12;
  if (p === 'once') return 0;
  const d = parseInt(p);
  if (!isNaN(d) && d > 0) return a * (30.44 / d);
  return a;
};
