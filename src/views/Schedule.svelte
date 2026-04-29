<script>
  import { store, openFlowModal } from '../lib/state.svelte.js';
  import { fmt2 } from '../lib/format.js';
  import { parseDate, fmtD, addDays, daysBetween } from '../lib/dates.js';

  const internalAccounts = $derived(store.accounts.filter((a) => !a.external));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = fmtD(today);
  const todayPlus30Str = fmtD(addDays(today, 30));

  let acctId = $state('');
  let resolution = $state('daily');
  let rangeStart = $state(todayStr);
  let rangeEnd = $state(todayPlus30Str);

  const simStartStr = $derived(fmtD(store.simData.startDate));
  const simEndStr = $derived(fmtD(store.simData.endDate));

  $effect(() => {
    if (!internalAccounts.find((a) => a.id === acctId)) {
      acctId = internalAccounts[0]?.id ?? '';
    }
  });

  const account = $derived(store.accounts.find((a) => a.id === acctId));

  const rows = $derived.by(() => {
    if (!account || !store.simData) return [];
    const sim = store.simData;
    const simStart = sim.startDate;
    const simEnd = sim.endDate;

    const rs = parseDate(rangeStart) || simStart;
    const re = parseDate(rangeEnd) || simEnd;
    const lo = rs < simStart ? simStart : rs;
    const hi = re > simEnd ? simEnd : re;
    if (hi < lo) return [];

    const byDay = {};
    for (const t of sim.allTransfers) {
      const ds = fmtD(t.date);
      if (!byDay[ds]) byDay[ds] = [];
      byDay[ds].push(t);
    }

    const balForDay = (d) => {
      const clamped = d > simEnd ? simEnd : (d < simStart ? simStart : d);
      const idx = daysBetween(simStart, clamped);
      const snap = sim.dailyBalances[idx];
      return snap?.balances[acctId] ?? 0;
    };

    const monthLabel = (d) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const dayLabel = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const shortLabel = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const buckets = [];
    if (resolution === 'daily') {
      const n = daysBetween(lo, hi);
      for (let i = 0; i <= n; i++) {
        const d = addDays(lo, i);
        buckets.push({ start: d, end: d, label: dayLabel(d) });
      }
    } else if (resolution === 'weekly') {
      let s = new Date(lo);
      while (s <= hi) {
        const e = addDays(s, 6);
        const realEnd = e > hi ? hi : e;
        buckets.push({ start: new Date(s), end: realEnd, label: `${shortLabel(s)} – ${shortLabel(realEnd)}` });
        s = addDays(s, 7);
      }
    } else {
      let s = new Date(lo);
      while (s <= hi) {
        const monthEnd = new Date(s.getFullYear(), s.getMonth() + 1, 0);
        const realEnd = monthEnd > hi ? hi : monthEnd;
        const isPartial = s.getDate() !== 1 || realEnd.getTime() !== monthEnd.getTime();
        const base = monthLabel(s);
        const label = isPartial ? `${base} (${s.getDate()}–${realEnd.getDate()})` : base;
        buckets.push({ start: new Date(s), end: realEnd, label });
        s = new Date(s.getFullYear(), s.getMonth() + 1, 1);
      }
    }

    return buckets.map((b) => {
      const flows = [];
      let total = 0;
      const seen = new Set();
      const days = daysBetween(b.start, b.end);
      for (let i = 0; i <= days; i++) {
        const d = addDays(b.start, i);
        const list = byDay[fmtD(d)];
        if (!list) continue;
        for (const t of list) {
          const isIn = t.to === acctId;
          const isOut = t.from === acctId;
          if (!isIn && !isOut) continue;
          if (isIn) total += t.amount;
          if (isOut) total -= t.amount;
          if (!seen.has(t.flowId)) { seen.add(t.flowId); flows.push({ id: t.flowId, name: t.name }); }
        }
      }
      return {
        label: b.label,
        flows,
        total,
        balance: balForDay(b.end),
      };
    });
  });

  const signedFmt = (v) => (v > 0 ? '+' : v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
</script>

<div class="view active" style="flex-direction:column;overflow:hidden;">
  <div class="ctrl">
    <label>
      Account
      <select bind:value={acctId} style="width:auto;margin-left:6px;">
        {#each internalAccounts as a (a.id)}
          <option value={a.id}>{a.name}</option>
        {/each}
      </select>
    </label>
    <label>
      From
      <input type="date" bind:value={rangeStart} min={simStartStr} max={simEndStr} style="margin-left:6px;" />
    </label>
    <label>
      To
      <input type="date" bind:value={rangeEnd} min={simStartStr} max={simEndStr} style="margin-left:6px;" />
    </label>
    <label>
      Resolution
      <select bind:value={resolution} style="width:auto;margin-left:6px;">
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </select>
    </label>
    {#if account?.annualRate}
      <span style="margin-left:auto;font-family:var(--mono);font-size:10px;color:var(--t3);">
        Rate {(account.annualRate * 100).toFixed(2)}% — interest reflected in balance on the 1st of each month
      </span>
    {/if}
  </div>

  <div style="flex:1;overflow-y:auto;padding:0 28px 28px;">
    <table class="sched-tbl" style="margin-top:14px;">
      <thead>
        <tr>
          <th style="width:220px;">Date</th>
          <th style="text-align:left;">Flows</th>
          <th style="width:140px;">Total flow</th>
          <th style="width:140px;">Running balance</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.label)}
          <tr>
            <td>{r.label}</td>
            <td style="text-align:left;color:var(--t2);white-space:normal;">
              {#if r.flows.length === 0}
                <span style="color:var(--t4);">—</span>
              {:else}
                {#each r.flows as fl, i (fl.id)}
                  <button type="button" class="sched-flow-link" onclick={() => openFlowModal(fl.id)}>{fl.name}</button>{#if i < r.flows.length - 1}<span style="color:var(--t4);">, </span>{/if}
                {/each}
              {/if}
            </td>
            <td>
              {#if r.total === 0}
                <span style="color:var(--t4);">—</span>
              {:else}
                <span style={r.total > 0 ? 'color:var(--grn);' : 'color:var(--red);'}>{signedFmt(r.total)}</span>
              {/if}
            </td>
            <td>{fmt2(r.balance)}</td>
          </tr>
        {/each}
        {#if rows.length === 0}
          <tr><td colspan="4" style="text-align:center;color:var(--t4);padding:24px;">No rows in range</td></tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>
