<script>
  import { store, openFlowModal } from '../lib/state.svelte.js';
  import { fmt2 } from '../lib/format.js';
  import { parseDate, fmtD, addDays, daysBetween } from '../lib/dates.js';

  let { acctId, rangeStart, rangeEnd, resolution } = $props();

  let expandedRows = $state(new Set());

  function toggleRow(key) {
    const next = new Set(expandedRows);
    if (next.has(key)) next.delete(key); else next.add(key);
    expandedRows = next;
  }
  export function expandAll() {
    expandedRows = new Set(rows.filter((r) => r.occurrences.length > 0).map((r) => r.label));
  }
  export function collapseAll() { expandedRows = new Set(); }

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

    let running = account.balance;
    return buckets.map((b) => {
      const occurrences = [];
      let total = 0;
      const days = daysBetween(b.start, b.end);
      for (let i = 0; i <= days; i++) {
        const d = addDays(b.start, i);
        const list = byDay[fmtD(d)];
        if (!list) continue;
        for (const t of list) {
          const isIn = t.to === acctId;
          const isOut = t.from === acctId;
          if (!isIn && !isOut) continue;
          const signed = isIn ? t.amount : -t.amount;
          total += signed;
          occurrences.push({ date: t.date, name: t.name, flowId: t.flowId, signed, overridden: t.overridden });
        }
      }
      occurrences.sort((a, b) => a.date - b.date);
      running += total;
      return {
        label: b.label,
        occurrences,
        total,
        balance: running,
      };
    });
  });

  const signedFmt = (v) => (v > 0 ? '+' : v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
</script>

<table class="sched-tbl">
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
      {@const hasFlows = r.occurrences.length > 0}
      {@const expanded = expandedRows.has(r.label)}
      <tr
        class="sched-period-row"
        class:clickable={hasFlows}
        class:expanded
        role={hasFlows ? 'button' : undefined}
        tabindex={hasFlows ? 0 : -1}
        aria-expanded={hasFlows ? expanded : undefined}
        onclick={hasFlows ? () => toggleRow(r.label) : null}
        onkeydown={hasFlows ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRow(r.label); } } : null}
      >
        <td>
          <span class="sched-toggle" class:open={expanded} class:hidden={!hasFlows}>▶</span>
          {r.label}
        </td>
        <td style="text-align:left;color:var(--t3);">
          {#if !hasFlows}
            <span style="color:var(--t4);">—</span>
          {:else}
            <span style="font-size:10px;">{r.occurrences.length} flow{r.occurrences.length === 1 ? '' : 's'}</span>
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
      {#if hasFlows && expanded}
        {#each r.occurrences as o, i (o.flowId + '@' + fmtD(o.date) + '#' + i)}
          <tr class="sched-occ-row">
            <td class="sched-occ-date">{o.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
            <td style="text-align:left;">
              <button type="button" class="sched-flow-link" onclick={(e) => { e.stopPropagation(); openFlowModal(o.flowId); }}>{o.name}</button>
              {#if o.overridden}<span class="sched-occ-ov" title="Overridden occurrence">●</span>{/if}
            </td>
            <td>
              <span style={o.signed > 0 ? 'color:var(--grn);' : 'color:var(--red);'}>{signedFmt(o.signed)}</span>
            </td>
            <td></td>
          </tr>
        {/each}
      {/if}
    {/each}
    {#if rows.length === 0}
      <tr><td colspan="4" style="text-align:center;color:var(--t4);padding:24px;">No rows in range</td></tr>
    {/if}
  </tbody>
</table>

<style>
  .sched-period-row td {
    background: var(--s3);
    color: var(--t1);
    border-bottom: 1px solid var(--b2);
    border-top: 1px solid var(--b2);
  }
  .sched-period-row td:first-child {
    box-shadow: inset 3px 0 0 var(--b3);
    color: var(--t1);
  }
  .sched-period-row.clickable { cursor: pointer; user-select: none; }
  .sched-period-row.clickable:hover td { background: var(--s4); }
  .sched-period-row.expanded td:first-child { box-shadow: inset 3px 0 0 var(--grn); }
  .sched-toggle {
    display: inline-block;
    width: 10px;
    font-size: 9px;
    color: var(--t3);
    margin-right: 6px;
    transition: transform 0.15s var(--ease);
  }
  .sched-toggle.open { transform: rotate(90deg); color: var(--grn); }
  .sched-toggle.hidden { visibility: hidden; }
  .sched-occ-row td {
    background: var(--s1);
    color: var(--t2);
    font-size: 10px;
    padding-top: 3px;
    padding-bottom: 3px;
  }
  .sched-occ-row:hover td { background: var(--s2); }
  .sched-occ-row td:first-child { box-shadow: inset 3px 0 0 var(--b1); }
  .sched-occ-date {
    padding-left: 28px !important;
    color: var(--t3);
    white-space: nowrap;
  }
  .sched-occ-ov {
    color: var(--amb);
    font-size: 9px;
    margin-left: 6px;
  }
</style>
