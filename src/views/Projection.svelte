<script>
  import { store, simulate } from '../lib/state.svelte.js';
  import { ACCT_COLORS, TYPE_LABELS } from '../lib/constants.js';
  import { fmt2 } from '../lib/format.js';
  import { fmtD, parseDate, daysBetween } from '../lib/dates.js';
  import BalanceChart from '../components/BalanceChart.svelte';
  import ScheduleTable from '../components/ScheduleTable.svelte';

  let chartMode = $state('lines');
  let pickerOpen = $state(false);
  let scheduleTables = $state({});
  let ctrlOpen = $state(false);

  const internalAccts = $derived(store.accounts.filter((a) => !a.external));
  const externalAccts = $derived(store.accounts.filter((a) => a.external));
  const finalNW = $derived(
    store.simData ? internalAccts.reduce((s, a) => s + (store.simData.finalBalances[a.id] || 0), 0) : 0
  );
  const sortedNW = $derived.by(() => {
    if (!store.simData) return [];
    return [...internalAccts].sort((a, b) => (store.simData.finalBalances[b.id] || 0) - (store.simData.finalBalances[a.id] || 0));
  });
  const externalNW = $derived.by(() => {
    if (!store.simData) return [];
    return externalAccts
      .filter((a) => (store.simData.finalBalances[a.id] || 0) !== 0)
      .sort((a, b) => Math.abs(store.simData.finalBalances[b.id] || 0) - Math.abs(store.simData.finalBalances[a.id] || 0));
  });

  $effect(() => {
    if (store.chartSelectedAccts.size === 0 && internalAccts.length > 0) {
      const chk = internalAccts.find((a) => a.type === 'checking');
      store.chartSelectedAccts = new Set([chk?.id ?? internalAccts[0].id]);
    }
  });

  let firstSimRun = true;
  $effect(() => {
    store.config.startDate;
    store.config.endDate;
    if (firstSimRun) { firstSimRun = false; return; }
    simulate();
  });

  const selectedAccounts = $derived(
    internalAccts.filter((a) => store.chartSelectedAccts.has(a.id))
  );
  const simStartStr = $derived(store.simData ? fmtD(store.simData.startDate) : '');
  const simEndStr = $derived(store.simData ? fmtD(store.simData.endDate) : '');
  const projMonths = $derived.by(() => {
    const s = parseDate(store.config.startDate);
    const e = parseDate(store.config.endDate);
    if (!s || !e) return 1;
    return Math.max(1, Math.round(daysBetween(s, e) / 30.44));
  });

  const spanPresets = [
    { id: '1w', label: '1 week', kind: 'day', n: 7 },
    { id: '1m', label: '1 month', kind: 'month', n: 1 },
    { id: '3m', label: '3 months', kind: 'month', n: 3 },
    { id: '6m', label: '6 months', kind: 'month', n: 6 },
    { id: '1y', label: '1 year', kind: 'year', n: 1 },
    { id: '5y', label: '5 years', kind: 'year', n: 5 },
    { id: '10y', label: '10 years', kind: 'year', n: 10 },
  ];

  function endFromSpan(start, p) {
    const e = new Date(start);
    if (p.kind === 'day') e.setDate(e.getDate() + p.n);
    else if (p.kind === 'month') e.setMonth(e.getMonth() + p.n);
    else if (p.kind === 'year') e.setFullYear(e.getFullYear() + p.n);
    return e;
  }

  const currentSpan = $derived.by(() => {
    const s = parseDate(store.config.startDate);
    const e = parseDate(store.config.endDate);
    if (!s || !e) return 'custom';
    const endStr = fmtD(e);
    for (const p of spanPresets) {
      if (fmtD(endFromSpan(s, p)) === endStr) return p.id;
    }
    return 'custom';
  });

  function setSpan(id) {
    if (id === 'custom') return;
    const p = spanPresets.find((x) => x.id === id);
    const s = parseDate(store.config.startDate);
    if (!p || !s) return;
    store.config.endDate = fmtD(endFromSpan(s, p));
  }

  const chartSnapshots = $derived.by(() => {
    if (!store.simData) return [];
    const sim = store.simData;
    const res = store.config.resolution;
    if (res === 'monthly' || !sim.dailyBalances?.length) return sim.monthlySnapshots;
    const daily = sim.dailyBalances;
    if (res === 'daily') {
      return daily.map((d) => ({ date: d.date, balances: d.balances }));
    }
    if (res === 'weekly') {
      const out = [];
      for (let i = 0; i < daily.length; i++) {
        const d = daily[i];
        const dow = (d.date.getDay() + 6) % 7;
        if (dow === 6 || i === daily.length - 1) {
          out.push({ date: d.date, balances: d.balances });
        }
      }
      return out;
    }
    return sim.monthlySnapshots;
  });

  function toggleChartAcct(id) {
    const next = new Set(store.chartSelectedAccts);
    if (next.has(id)) next.delete(id); else next.add(id);
    store.chartSelectedAccts = next;
  }
  function selectAll() { store.chartSelectedAccts = new Set(internalAccts.map((a) => a.id)); }
  function selectNone() { store.chartSelectedAccts = new Set(); }
  function selectPreset(p) {
    const next = new Set();
    if (p === 'liquid') internalAccts.filter((a) => a.type === 'checking' || a.type === 'savings').forEach((a) => next.add(a.id));
    else if (p === 'nw') internalAccts.forEach((a) => next.add(a.id));
    store.chartSelectedAccts = next;
  }
  function onDocClick(e) {
    if (!e.target.closest('#projPickerWrap')) pickerOpen = false;
  }
  function expandAll() { Object.values(scheduleTables).forEach((t) => t?.expandAll()); }
  function collapseAll() { Object.values(scheduleTables).forEach((t) => t?.collapseAll()); }
</script>

<svelte:document onclick={onDocClick} />

<div class="view active" style="flex-direction:column;overflow:hidden;">
  <div class="proj-mobile-ctrl">
    <button type="button" class="ctrl-toggle" onclick={() => ctrlOpen = !ctrlOpen}>
      <span>Range</span>
      <span class="ctrl-toggle-caret">{ctrlOpen ? '▴' : '▾'}</span>
    </button>
  </div>
  <div class="ctrl-body" class:open={ctrlOpen}>
    <label for="projStart">Start</label>
    <input id="projStart" type="date" bind:value={store.config.startDate} />
    <label for="projEnd">End</label>
    <input id="projEnd" type="date" bind:value={store.config.endDate} />
    <label for="projSpan">Span</label>
    <select id="projSpan" value={currentSpan} onchange={(e) => setSpan(e.currentTarget.value)}>
      {#if currentSpan === 'custom'}<option value="custom">Custom</option>{/if}
      {#each spanPresets as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
    </select>
    <label for="projRes">Resolution</label>
    <select id="projRes" bind:value={store.config.resolution}>
      <option value="daily">Daily</option>
      <option value="weekly">Weekly</option>
      <option value="monthly">Monthly</option>
    </select>
  </div>

  <div class="proj-scroll">
    <div class="proj-section">
      <div class="proj-section-head">
        <div class="dash-h" style="margin:0;">Balance over time</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <select bind:value={chartMode} style="font-size:10px;padding:3px 6px;width:auto;">
            <option value="lines">Individual lines</option>
            <option value="stacked">Stacked area (NW)</option>
          </select>
          <div style="position:relative;" id="projPickerWrap">
            <button onclick={(e) => { e.stopPropagation(); pickerOpen = !pickerOpen; }} style="font-size:10px;padding:4px 10px;min-width:130px;text-align:left;">
              <span>{store.chartSelectedAccts.size === 0 ? 'No accounts' : store.chartSelectedAccts.size === 1 ? '1 account' : store.chartSelectedAccts.size + ' accounts'}</span>
              <span style="float:right;color:var(--t4);">▾</span>
            </button>
            {#if pickerOpen}
              <div style="position:absolute;right:0;top:100%;margin-top:4px;background:var(--s1);border:1px solid var(--b2);border-radius:6px;padding:6px 0;z-index:20;min-width:220px;max-height:320px;overflow-y:auto;">
                <div style="padding:4px 12px 8px;display:flex;gap:6px;border-bottom:1px solid var(--b1);margin-bottom:4px;">
                  <button onclick={selectAll} style="font-size:9px;padding:2px 6px;">All</button>
                  <button onclick={selectNone} style="font-size:9px;padding:2px 6px;">None</button>
                  <button onclick={() => selectPreset('liquid')} style="font-size:9px;padding:2px 6px;">Liquid</button>
                  <button onclick={() => selectPreset('nw')} style="font-size:9px;padding:2px 6px;">Net Worth</button>
                </div>
                {#each internalAccts as a (a.id)}
                  {@const on = store.chartSelectedAccts.has(a.id)}
                  <label style="display:flex;align-items:center;gap:8px;padding:5px 12px;cursor:pointer;font-family:var(--mono);font-size:11px;color:{on ? 'var(--t1)' : 'var(--t3)'};">
                    <input type="checkbox" checked={on} onchange={() => toggleChartAcct(a.id)} />
                    <span style="width:8px;height:8px;border-radius:50%;background:{ACCT_COLORS[a.type] || '#6a7490'};flex-shrink:0;"></span>
                    {a.name}
                    <span style="margin-left:auto;font-size:9px;color:var(--t4);">{TYPE_LABELS[a.type] || a.type}</span>
                  </label>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>
      <div class="proj-chart-wrap">
        {#if store.simData}
          <BalanceChart
            snapshots={chartSnapshots}
            {selectedAccounts}
            mode={chartMode}
            projMonths={projMonths}
            resolution={store.config.resolution}
            transfers={store.simData.allTransfers}
          />
        {/if}
      </div>
    </div>

    {#if store.simData}
      <div class="proj-section">
        <div class="proj-section-head">
          <div class="dash-h" style="margin:0;">Net worth breakdown (end of period)</div>
        </div>
        {#each sortedNW as a (a.id)}
          {@const bal = store.simData.finalBalances[a.id] || 0}
          <div class="nw-row">
            <div class="nw-dot" style="background:{ACCT_COLORS[a.type]}"></div>
            <div class="nw-name">{a.name}</div>
            <div class="nw-val" style="color:{bal >= 0 ? 'var(--grn)' : 'var(--red)'}">{fmt2(bal)}</div>
            <div class="nw-pct">{finalNW > 0 ? (bal / finalNW * 100).toFixed(1) + '%' : ''}</div>
          </div>
        {/each}
        <div class="nw-row" style="border-top:2px solid var(--b2);margin-top:4px;padding-top:8px;font-weight:700;">
          <div class="nw-dot" style="background:transparent;"></div>
          <div class="nw-name" style="color:var(--t1);">Net Worth</div>
          <div class="nw-val" style="color:var(--grn)">{fmt2(finalNW)}</div>
          <div class="nw-pct">100%</div>
        </div>
        {#if externalNW.length}
          <div style="font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:0.8px;color:var(--t4);margin:16px 0 6px;">External accounts ({projMonths}mo totals)</div>
          {#each externalNW as a (a.id)}
            {@const bal = store.simData.finalBalances[a.id] || 0}
            <div class="nw-row">
              <div class="nw-dot" style="background:{ACCT_COLORS[a.type] || '#6a7490'};opacity:0.5;"></div>
              <div class="nw-name" style="color:var(--t3);">{a.name}</div>
              <div class="nw-val" style="color:{bal > 0 ? 'var(--grn)' : 'var(--red)'};">{fmt2(Math.abs(bal))}</div>
            </div>
          {/each}
        {/if}
      </div>
    {/if}

    <div class="proj-section">
      <div class="proj-section-head">
        <div class="dash-h" style="margin:0;">Scheduled flows</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button type="button" onclick={expandAll} title="Expand all rows" style="font-size:10px;padding:3px 8px;">⊞</button>
          <button type="button" onclick={collapseAll} title="Collapse all rows" style="font-size:10px;padding:3px 8px;">⊟</button>
        </div>
      </div>
      {#if selectedAccounts.length === 0}
        <div style="font-family:var(--mono);font-size:11px;color:var(--t4);padding:24px;text-align:center;">
          No accounts selected. Use the account picker above to choose at least one.
        </div>
      {:else}
        {#each selectedAccounts as a (a.id)}
          <div class="proj-sched-block">
            <div class="proj-sched-head">
              <span class="proj-sched-dot" style:background={ACCT_COLORS[a.type] || '#6a7490'}></span>
              <span class="proj-sched-name">{a.name}</span>
              <span class="proj-sched-meta">
                Current balance
                <span style="color:{a.balance >= 0 ? 'var(--grn)' : 'var(--red)'};font-weight:600;">{fmt2(a.balance)}</span>
                {#if a.annualRate}
                  <span style="color:var(--t4);"> · {(a.annualRate * 100).toFixed(2)}% rate (interest not projected here)</span>
                {/if}
              </span>
            </div>
            <ScheduleTable
              bind:this={scheduleTables[a.id]}
              acctId={a.id}
              rangeStart={simStartStr}
              rangeEnd={simEndStr}
              resolution={store.config.resolution}
            />
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .proj-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .proj-mobile-ctrl {
    display: none;
  }
  @media (max-width: 640px) {
    .proj-mobile-ctrl {
      display: flex;
      justify-content: flex-end;
      padding: 10px 14px;
      background: var(--s1);
      border-bottom: 1px solid var(--b1);
    }
  }
  .proj-section {
    padding: 18px 28px;
    border-bottom: 1px solid var(--b1);
  }
  .proj-section:last-child {
    border-bottom: none;
  }
  .proj-section-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .proj-chart-wrap {
    height: 360px;
  }
  .proj-sched-block {
    margin-bottom: 18px;
  }
  .proj-sched-block:last-child {
    margin-bottom: 0;
  }
  .proj-sched-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 0 8px;
    border-bottom: 1px solid var(--b1);
    margin-bottom: 6px;
    font-family: var(--mono);
  }
  .proj-sched-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .proj-sched-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--t1);
  }
  .proj-sched-meta {
    font-size: 10px;
    color: var(--t3);
    margin-left: auto;
  }
</style>
