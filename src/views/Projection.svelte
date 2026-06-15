<script>
  import { store, simulate, toggleCompare } from '../lib/state.svelte.js';
  import { ACCT_COLORS, TYPE_LABELS } from '../lib/constants.js';
  import { fmt2 } from '../lib/format.js';
  import { fmtD, parseDate, daysBetween } from '../lib/dates.js';
  import BalanceChart from '../components/BalanceChart.svelte';
  import ScheduleTable from '../components/ScheduleTable.svelte';
  import { theme, cssVar } from '../lib/theme.svelte.js';
  import { isMobile } from '../lib/platform.js';
  import { fly, fade } from 'svelte/transition';

  // Net Worth lines track the primary text color so they stay visible in
  // both themes; reading theme.mode keeps the derived colors reactive.
  const nwColor = $derived((theme.mode, cssVar('--t1')));

  let pickerOpen = $state(false);
  let scheduleTables = $state({});
  let ctrlOpen = $state(false);
  let rangeSheetOpen = $state(false);

  const NW_ID = '__nw__';

  const internalAccts = $derived(store.accounts.filter((a) => !a.external));
  const externalAccts = $derived(store.accounts.filter((a) => a.external));
  const finalNW = $derived(
    store.simData ? internalAccts.reduce((s, a) => s + (store.simData.finalBalances[a.id] || 0), 0) : 0
  );

  const otherScenarios = $derived(
    store.scenarios.filter((s) => s.id !== store.activeScenarioId)
  );

  const COMPARE_COLORS = ['#f5a847', '#ec4899', '#a78bfa', '#22d3ee', '#84cc16', '#fb923c'];
  const COMPARE_DASH = [[5, 3], [2, 2], [8, 3, 2, 3], [12, 4], [3, 5], [10, 3, 3, 3]];

  const compareScenarios = $derived.by(() => {
    return [...store.compareIds]
      .filter((id) => id !== store.activeScenarioId)
      .map((id) => {
        const sc = store.scenarios.find((s) => s.id === id);
        const sim = store.compareSims[id];
        if (!sc || !sim) return null;
        const internalIds = new Set(sc.accounts.filter((a) => !a.external).map((a) => a.id));
        const finalNW = [...internalIds].reduce((s, aid) => s + (sim.finalBalances[aid] || 0), 0);
        return { id, name: sc.name, sim, internalIds, finalNW };
      })
      .filter(Boolean);
  });
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
    if (store.chartSelectedAcctId === NW_ID) return;
    if (!internalAccts.find((a) => a.id === store.chartSelectedAcctId) && internalAccts.length > 0) {
      const chk = internalAccts.find((a) => a.type === 'checking');
      store.chartSelectedAcctId = chk?.id ?? internalAccts[0].id;
    }
  });

  let firstSimRun = true;
  $effect(() => {
    store.config.startDate;
    store.config.endDate;
    if (firstSimRun) { firstSimRun = false; return; }
    simulate();
  });

  const isNW = $derived(store.chartSelectedAcctId === NW_ID);
  const selectedAccount = $derived(internalAccts.find((a) => a.id === store.chartSelectedAcctId));
  const selectedLabel = $derived(isNW ? 'Net Worth' : (selectedAccount?.name ?? 'Net Worth'));
  const selectedAcctIds = $derived(
    isNW ? new Set(internalAccts.map((a) => a.id)) : new Set(selectedAccount ? [selectedAccount.id] : [])
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

  function snapshotsFor(sim, res) {
    if (!sim) return [];
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
  }

  const chartSnapshots = $derived(snapshotsFor(store.simData, store.config.resolution));

  const primaryLine = $derived.by(() => {
    if (!chartSnapshots.length) return null;
    if (isNW) {
      const ids = internalAccts.map((a) => a.id);
      return {
        name: 'Net Worth',
        data: chartSnapshots.map((s) => ids.reduce((sum, id) => sum + (s.balances[id] || 0), 0)),
        color: nwColor,
      };
    }
    if (!selectedAccount) return null;
    return {
      name: selectedAccount.name,
      data: chartSnapshots.map((s) => s.balances[selectedAccount.id] || 0),
      color: ACCT_COLORS[selectedAccount.type] || '#6a7490',
    };
  });

  const compareLines = $derived.by(() => {
    const result = [];
    compareScenarios.forEach((cs, i) => {
      const snaps = snapshotsFor(cs.sim, store.config.resolution);
      const dash = COMPARE_DASH[i % COMPARE_DASH.length];
      if (isNW) {
        const ids = [...cs.internalIds];
        result.push({
          id: cs.id + ':nw',
          name: `Net Worth · ${cs.name}`,
          data: snaps.map((s) => ids.reduce((sum, aid) => sum + (s.balances[aid] || 0), 0)),
          color: nwColor,
          dash,
        });
      } else if (selectedAccount && cs.internalIds.has(selectedAccount.id)) {
        const aid = selectedAccount.id;
        result.push({
          id: cs.id + ':' + aid,
          name: `${selectedAccount.name} · ${cs.name}`,
          data: snaps.map((s) => s.balances[aid] || 0),
          color: ACCT_COLORS[selectedAccount.type] || '#6a7490',
          dash,
        });
      }
    });
    return result;
  });

  function selectAcct(id) {
    store.chartSelectedAcctId = id;
    pickerOpen = false;
  }
  function onDocClick(e) {
    if (!e.target.closest('#projPickerWrap')) pickerOpen = false;
  }
  function expandAll() { Object.values(scheduleTables).forEach((t) => t?.expandAll()); }
  function collapseAll() { Object.values(scheduleTables).forEach((t) => t?.collapseAll()); }
</script>

<svelte:document onclick={onDocClick} />

<div class="view active" style="flex-direction:column;overflow:hidden;">
  <div class="proj-range-bar">
    <button type="button" class="ctrl-toggle proj-range-toggle" onclick={() => { if (isMobile) rangeSheetOpen = true; else ctrlOpen = !ctrlOpen; }}>
      <span>Range · {projMonths}mo · {store.config.resolution}</span>
      <span class="ctrl-toggle-caret">{(isMobile ? rangeSheetOpen : ctrlOpen) ? '▴' : '▾'}</span>
    </button>
  </div>
  {#if !isMobile}
    <div class="ctrl-body proj-range-body" class:open={ctrlOpen}>
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
  {/if}

  {#if isMobile && rangeSheetOpen}
    <div class="sheet-overlay" transition:fade={{ duration: 150 }} onclick={() => (rangeSheetOpen = false)} role="presentation">
      <div class="sheet" transition:fly={{ y: 320, duration: 240 }} onclick={(e) => e.stopPropagation()}>
        <div class="sheet-grab"></div>

        <div class="sheet-sec-label">Time span</div>
        <div class="sheet-chips">
          {#each spanPresets as p (p.id)}
            <button type="button" class="sheet-chip" class:active={currentSpan === p.id} onclick={() => setSpan(p.id)}>{p.label}</button>
          {/each}
        </div>

        <div class="sheet-divider"></div>
        <div class="sheet-sec-label">Custom range</div>
        <div class="sheet-field"><span class="sheet-field-l">Start</span><input type="date" bind:value={store.config.startDate} /></div>
        <div class="sheet-field"><span class="sheet-field-l">End</span><input type="date" bind:value={store.config.endDate} /></div>

        <div class="sheet-divider"></div>
        <div class="sheet-sec-label">Resolution</div>
        <div class="sheet-chips">
          {#each [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']] as [val, lbl] (val)}
            <button type="button" class="sheet-chip" class:active={store.config.resolution === val} onclick={() => (store.config.resolution = val)}>{lbl}</button>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <div class="proj-scroll">
    <div class="proj-section">
      <div class="proj-section-head">
        <div class="dash-h" style="margin:0;">Balance over time</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <div style="position:relative;" id="projPickerWrap">
            <button onclick={(e) => { e.stopPropagation(); pickerOpen = !pickerOpen; }} style="font-size:10px;padding:4px 10px;min-width:150px;text-align:left;">
              <span>{selectedLabel}</span>
              <span style="float:right;color:var(--t4);">▾</span>
            </button>
            {#if pickerOpen}
              <div style="position:absolute;right:0;top:100%;margin-top:4px;background:var(--s1);border:1px solid var(--b2);border-radius:6px;padding:6px 0;z-index:20;min-width:240px;max-height:360px;overflow-y:auto;">
                {#if otherScenarios.length}
                  <div style="padding:2px 12px 4px;font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:0.6px;color:var(--t4);">Compare scenarios</div>
                  {#each otherScenarios as s, i (s.id)}
                    {@const on = store.compareIds.has(s.id)}
                    {@const dash = COMPARE_DASH[i % COMPARE_DASH.length]}
                    <label style="display:flex;align-items:center;gap:8px;padding:5px 12px;cursor:pointer;font-family:var(--mono);font-size:11px;color:{on ? 'var(--t1)' : 'var(--t3)'};">
                      <input type="checkbox" checked={on} onchange={() => toggleCompare(s.id)} />
                      <svg width="18" height="6" style="flex-shrink:0;">
                        <line x1="0" y1="3" x2="18" y2="3" stroke="var(--t2)" stroke-width="2" stroke-dasharray={dash.join(',')} />
                      </svg>
                      {s.name}
                      <span style="margin-left:auto;font-size:9px;color:var(--t4);">overlay</span>
                    </label>
                  {/each}
                  <div style="border-top:1px solid var(--b1);margin:4px 0;padding:2px 12px 0;font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:0.6px;color:var(--t4);">Account</div>
                {/if}
                <div
                  role="button"
                  tabindex="0"
                  onclick={() => selectAcct(NW_ID)}
                  onkeydown={(e) => e.key === 'Enter' && selectAcct(NW_ID)}
                  style="display:flex;align-items:center;gap:8px;padding:5px 12px;cursor:pointer;font-family:var(--mono);font-size:11px;color:{isNW ? 'var(--t1)' : 'var(--t3)'};background:{isNW ? 'var(--s2)' : 'transparent'};font-weight:{isNW ? '600' : '400'};"
                >
                  <span style="width:8px;height:8px;border-radius:50%;background:var(--t1);flex-shrink:0;"></span>
                  Net Worth
                  <span style="margin-left:auto;font-size:9px;color:var(--t4);">all internal</span>
                </div>
                {#each internalAccts as a (a.id)}
                  {@const on = store.chartSelectedAcctId === a.id}
                  <div
                    role="button"
                    tabindex="0"
                    onclick={() => selectAcct(a.id)}
                    onkeydown={(e) => e.key === 'Enter' && selectAcct(a.id)}
                    style="display:flex;align-items:center;gap:8px;padding:5px 12px;cursor:pointer;font-family:var(--mono);font-size:11px;color:{on ? 'var(--t1)' : 'var(--t3)'};background:{on ? 'var(--s2)' : 'transparent'};font-weight:{on ? '600' : '400'};"
                  >
                    <span style="width:8px;height:8px;border-radius:50%;background:{ACCT_COLORS[a.type] || '#6a7490'};flex-shrink:0;"></span>
                    {a.name}
                    <span style="margin-left:auto;font-size:9px;color:var(--t4);">{TYPE_LABELS[a.type] || a.type}</span>
                  </div>
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
            {primaryLine}
            {selectedAcctIds}
            projMonths={projMonths}
            resolution={store.config.resolution}
            transfers={store.simData.allTransfers}
            {compareLines}
          />
        {/if}
      </div>
    </div>

    {#if store.simData}
      <div class="proj-section nw-section">
        <div class="proj-section-head">
          <div class="dash-h" style="margin:0;">Net worth breakdown (end of period)</div>
        </div>
        {#if compareScenarios.length}
          <div style="margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--b2);">
            <div style="font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:0.8px;color:var(--t4);margin-bottom:6px;">Compare scenarios — net worth at end of period</div>
            <div class="nw-row" style="font-weight:600;">
              <div class="nw-dot" style="background:var(--grn);"></div>
              <div class="nw-name">{store.activeScenario?.name ?? 'Active'} <span style="color:var(--t4);font-size:9px;margin-left:6px;">active</span></div>
              <div class="nw-val" style="color:var(--grn);">{fmt2(finalNW)}</div>
            </div>
            {#each compareScenarios as cs, i (cs.id)}
              {@const color = ['#f5a847', '#ec4899', '#a78bfa', '#22d3ee', '#84cc16', '#fb923c'][i % 6]}
              {@const delta = cs.finalNW - finalNW}
              <div class="nw-row">
                <div class="nw-dot" style="background:{color};"></div>
                <div class="nw-name">{cs.name}</div>
                <div class="nw-val" style="color:{cs.finalNW >= 0 ? 'var(--grn)' : 'var(--red)'};">{fmt2(cs.finalNW)}</div>
                <div class="nw-pct" style="color:{delta >= 0 ? 'var(--grn)' : 'var(--red)'};">{delta >= 0 ? '+' : ''}{fmt2(delta)}</div>
              </div>
            {/each}
          </div>
        {/if}
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

    <div class="proj-section sched-section">
      <div class="proj-section-head">
        <div class="dash-h" style="margin:0;">Scheduled flows</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button type="button" onclick={expandAll} title="Expand all rows" style="font-size:10px;padding:3px 8px;">⊞</button>
          <button type="button" onclick={collapseAll} title="Collapse all rows" style="font-size:10px;padding:3px 8px;">⊟</button>
        </div>
      </div>
      {#if isNW}
        <div style="font-family:var(--mono);font-size:11px;color:var(--t4);padding:24px;text-align:center;">
          Pick a specific account in the picker above to see its scheduled flows.
        </div>
      {:else if !selectedAccount}
        <div style="font-family:var(--mono);font-size:11px;color:var(--t4);padding:24px;text-align:center;">
          No account selected.
        </div>
      {:else}
        <div class="proj-sched-block">
          <div class="proj-sched-head">
            <span class="proj-sched-dot" style:background={ACCT_COLORS[selectedAccount.type] || '#6a7490'}></span>
            <span class="proj-sched-name">{selectedAccount.name}</span>
            <span class="proj-sched-meta">
              Current balance
              <span style="color:{selectedAccount.balance >= 0 ? 'var(--grn)' : 'var(--red)'};font-weight:600;">{fmt2(selectedAccount.balance)}</span>
              {#if selectedAccount.annualRate}
                <span style="color:var(--t4);"> · {(selectedAccount.annualRate * 100).toFixed(2)}% rate (interest not projected here)</span>
              {/if}
            </span>
          </div>
          <ScheduleTable
            bind:this={scheduleTables[selectedAccount.id]}
            acctId={selectedAccount.id}
            rangeStart={simStartStr}
            rangeEnd={simEndStr}
            resolution={store.config.resolution}
          />
        </div>
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
  /* Mobile: normal sections keep a 14px gutter, but the schedule and net-worth
     sections go full-bleed (0 side padding) so their rows reach the screen edge.
     This lives here (not global style.css) because the base .proj-section padding
     is scoped and outranks global overrides on specificity. */
  @media (max-width: 640px) {
    .proj-section { padding: 14px; }
    /* Schedule: zero the section padding (its header/cells are re-inset
       individually) so the table reaches the edges. The net-worth section keeps
       its 14px gutter — its title/labels stay inset and only the rows break out
       (see .nw-section .nw-row in style.css). */
    .sched-section { padding-left: 0; padding-right: 0; }
  }
</style>
