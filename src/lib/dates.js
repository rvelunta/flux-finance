export function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function fmtD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

export function getOccurrences(start, end, period, evStart, evEnd) {
  const occ = [];
  const s = parseDate(evStart);
  const e = evEnd ? parseDate(evEnd) : null;
  if (!s) return occ;

  if (period === 'once') {
    if (s >= start && s <= end) occ.push(new Date(s));
    return occ;
  }
  if (period === 'monthly') {
    const dom = s.getDate();
    let c = new Date(start.getFullYear(), start.getMonth(), dom);
    if (c < start) c.setMonth(c.getMonth() + 1);
    while (c <= end) {
      if (c >= s && (!e || c <= e)) occ.push(new Date(c));
      c.setMonth(c.getMonth() + 1);
      if (c.getDate() !== dom) c.setDate(0);
    }
  } else if (period === 'semi-monthly') {
    const d1 = 15, d2 = s.getDate();
    const ds = d1 === d2 ? [1, 15] : [d1, d2];
    let c = new Date(start.getFullYear(), start.getMonth(), 1);
    while (c <= end) {
      const m = c.getMonth(), y = c.getFullYear();
      ds.forEach((day) => {
        const dt = new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
        if (dt >= start && dt <= end && dt >= s && (!e || dt <= e)) occ.push(dt);
      });
      c.setMonth(c.getMonth() + 1);
    }
  } else if (period === 'quarterly') {
    let c = new Date(s);
    while (c <= end) {
      if (c >= start && (!e || c <= e)) occ.push(new Date(c));
      c.setMonth(c.getMonth() + 3);
    }
  } else if (period === 'annual') {
    let c = new Date(s);
    while (c <= end) {
      if (c >= start && (!e || c <= e)) occ.push(new Date(c));
      c.setFullYear(c.getFullYear() + 1);
    }
  } else {
    const days = parseInt(period);
    if (isNaN(days) || days <= 0) return occ;
    let c = new Date(s);
    if (c < start) {
      const gap = daysBetween(c, start);
      c = addDays(c, Math.floor(gap / days) * days);
      if (c < start) c = addDays(c, days);
    }
    while (c <= end) {
      if (!e || c <= e) occ.push(new Date(c));
      c = addDays(c, days);
    }
  }
  return occ;
}
