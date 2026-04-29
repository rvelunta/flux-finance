<script>
  import { store, simulate } from '../lib/state.svelte.js';
  import { ACCT_COLORS, CAT_COLORS, TYPE_LABELS } from '../lib/constants.js';
  import { fmt0, fmt2, toMonthlyAmt } from '../lib/format.js';
  import BalanceChart from '../components/BalanceChart.svelte';
  import CashflowChart from '../components/CashflowChart.svelte';

  let pickerOpen = $state(false);
  let chartMode = $state('lines');

  const internalAccts = $derived(store.accounts.filter((a) => !a.external));
  const externalAccts = $derived(store.accounts.filter((a) => a.external));
  const chkId = $derived(store.accounts.find((a) => a.type === 'checking' && !a.external)?.id);

  const selectedAccounts = $derived(
    internalAccts.filter((a) => store.chartSelectedAccts.has(a.id))
  );

  const kpis = $derived.by(() => {
    if (!store.simData) return null;
    const sim = store.simData;
    const finalNW = internalAccts.reduce((s, a) => s + (sim.finalBalances[a.id] || 0), 0);
    const startNW = internalAccts.reduce((s, a) => s + a.balance, 0);
    const nwDelta = finalNW - startNW;
    const months = parseInt(store.config.months);
    let tIn = 0, tOut = 0;
    if (chkId) sim.allTransfers.forEach((t) => {
      if (t.to === chkId) tIn += t.amount;
      if (t.from === chkId) tOut += t.amount;
    });
    return { finalNW, nwDelta, months, mIn: tIn / months, mOut: tOut / months };
  });

  const waterfallGroups = $derived.by(() => {
    const groups = [...new Set(store.flows.filter((fl) => fl.group).map((fl) => fl.group))]
      .filter((g) =>
        store.flows.some((fl) => fl.group === g && fl.enabled && fl.category === 'income')
      );
    return groups.map((g) => {
      const gFlows = store.flows.filter((fl) => fl.group === g && fl.enabled);
      const grossM = gFlows.reduce((s, fl) => s + toMonthlyAmt(fl), 0);
      const netM = gFlows.filter((fl) => fl.category === 'income').reduce((s, fl) => s + toMonthlyAmt(fl), 0);
      const deductions = gFlows.filter((fl) => fl.category !== 'income').map((fl) => ({
        name: fl.name.replace(g + ' ', '').replace(g.charAt(0).toUpperCase() + g.slice(1) + ' ', ''),
        m: toMonthlyAmt(fl),
        pct: grossM > 0 ? (toMonthlyAmt(fl) / grossM * 100) : 0,
      }));
      return { g, grossM, netM, deductions };
    });
  });

  const expenseCats = $derived.by(() => {
    const catTotals = {};
    const extIds = new Set(externalAccts.map((a) => a.id));
    const intIds = new Set(internalAccts.map((a) => a.id));
    const debtIds = new Set(internalAccts.filter((a) => a.type === 'debt').map((a) => a.id));
    const accountsWithOutflows = new Set(
      store.flows.filter((fl) => fl.enabled).map((fl) => fl.from)
    );
    // A flow is an expense if it lands at a "sink": an external account, or
    // a debt account that has no outflows of its own (so the debt account is
    // effectively terminal). Once purchase-flows are routed through a debt
    // account, that account gains outflows and the inflow demotes to a
    // transfer — the leaf-bound flows then carry the expense category.
    const isExpenseSink = (id) =>
      extIds.has(id) || (debtIds.has(id) && !accountsWithOutflows.has(id));
    store.flows
      .filter((fl) => fl.enabled && intIds.has(fl.from) && isExpenseSink(fl.to))
      .forEach((fl) => {
        const cat = fl.category;
        if (!catTotals[cat]) catTotals[cat] = 0;
        catTotals[cat] += toMonthlyAmt(fl);
      });
    const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
    const max = sorted.length ? sorted[0][1] : 1;
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    return { sorted, max, total };
  });

  const linkedPairs = $derived.by(() => {
    if (!store.simData) return [];
    return store.accounts.filter((a) => a.linkedTo && !a.external).map((debt) => {
      const asset = store.accounts.find((a) => a.id === debt.linkedTo);
      if (!asset) return null;
      const dBal = store.simData.finalBalances[debt.id] || 0;
      const aBal = store.simData.finalBalances[asset.id] || 0;
      const equity = aBal + dBal;
      const ltv = aBal > 0 ? Math.abs(dBal) / aBal * 100 : 0;
      return { debt, asset, dBal, aBal, equity, ltv };
    }).filter(Boolean);
  });

  const unlinkedDebt = $derived.by(() => {
    if (!store.simData) return [];
    return store.accounts.filter(
      (a) => a.type === 'debt' && !a.external && !a.linkedTo && (store.simData.finalBalances[a.id] || 0) < 0
    );
  });

  const groupedByType = $derived.by(() => {
    if (!store.simData) return [];
    const typeOrder = ['checking', 'savings', 'retirement', 'hsa', 'brokerage', 'property', 'crypto', 'debt'];
    const labels = { checking: 'Cash', savings: 'Savings', retirement: 'Retirement', hsa: 'HSA', brokerage: 'Brokerage', property: 'Real Estate', crypto: 'Crypto', debt: 'Debt' };
    const groups = {};
    internalAccts.forEach((a) => {
      if (!groups[a.type]) groups[a.type] = [];
      groups[a.type].push(a);
    });
    return typeOrder.filter((t) => groups[t]?.length).map((t) => {
      const members = [...groups[t]].sort(
        (a, b) => (store.simData.finalBalances[b.id] || 0) - (store.simData.finalBalances[a.id] || 0)
      );
      const netBal = members.reduce((s, a) => s + (store.simData.finalBalances[a.id] || 0), 0);
      return { t, label: labels[t] || t, members, netBal, color: ACCT_COLORS[t] || '#6a7490' };
    });
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
    if (!e.target.closest('#acctPickerWrap')) pickerOpen = false;
  }
</script>

<svelte:document onclick={onDocClick} />

<div class="view active" style="flex-direction:column;overflow:hidden;">
  <div class="ctrl">
    <label for="cfgStart">Start</label>
    <input id="cfgStart" type="date" bind:value={store.config.startDate} />
    <label for="cfgMonths">Project</label>
    <select id="cfgMonths" bind:value={store.config.months}>
      <option value={3}>3 mo</option>
      <option value={6}>6 mo</option>
      <option value={12}>1 yr</option>
      <option value={24}>2 yr</option>
      <option value={60}>5 yr</option>
      <option value={120}>10 yr</option>
      <option value={180}>15 yr</option>
      <option value={360}>30 yr</option>
      <option value={600}>50 yr</option>
    </select>
    <button class="pri" onclick={simulate}>Run Simulation</button>
  </div>

  {#if kpis}
    <div class="kpis" style="grid-template-columns:repeat(5,1fr);">
      <div class="kpi">
        <div class="k-label">Net Worth</div>
        <div class="k-val" style="color:var(--grn)">{fmt2(kpis.finalNW)}</div>
        <div class="k-sub">{kpis.nwDelta >= 0 ? '+' : ''}{fmt0(kpis.nwDelta)} over {kpis.months}mo</div>
      </div>
      <div class="kpi">
        <div class="k-label">Checking Min</div>
        <div class="k-val" style="color:{store.simData.minBal < 0 ? 'var(--red)' : store.simData.minBal < 2000 ? 'var(--amb)' : 'var(--t1)'}">{fmt2(store.simData.minBal)}</div>
        <div class="k-sub">{store.simData.minBalDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
      </div>
      <div class="kpi">
        <div class="k-label">Mo. Inflow</div>
        <div class="k-val" style="color:var(--grn)">{fmt0(kpis.mIn)}</div>
        <div class="k-sub">to checking</div>
      </div>
      <div class="kpi">
        <div class="k-label">Mo. Outflow</div>
        <div class="k-val" style="color:var(--red)">{fmt0(kpis.mOut)}</div>
        <div class="k-sub">from checking</div>
      </div>
      <div class="kpi">
        <div class="k-label">Mo. Net</div>
        <div class="k-val" style="color:{kpis.mIn - kpis.mOut >= 0 ? 'var(--grn)' : 'var(--red)'}">
          {kpis.mIn - kpis.mOut >= 0 ? '+' : '-'}{fmt0(Math.abs(kpis.mIn - kpis.mOut))}
        </div>
        <div class="k-sub">savings rate {kpis.mIn > 0 ? ((kpis.mIn - kpis.mOut) / kpis.mIn * 100).toFixed(0) : 0}%</div>
      </div>
    </div>
  {/if}

  <div class="dash-scroll">
    <div class="dash-grid">
      <div class="full">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div class="dash-h" style="margin:0;">Balance over time</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <select bind:value={chartMode} style="font-size:10px;padding:3px 6px;width:auto;">
              <option value="lines">Individual lines</option>
              <option value="stacked">Stacked area (NW)</option>
            </select>
            <div style="position:relative;" id="acctPickerWrap">
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
        <div class="dash-chart-wrap tall">
          {#if store.simData}
            <BalanceChart
              snapshots={store.simData.monthlySnapshots}
              {selectedAccounts}
              mode={chartMode}
              projMonths={store.config.months}
            />
          {/if}
        </div>
      </div>

      <div>
        <div class="dash-h">Account balances (end of period)</div>
        {#if store.simData && kpis}
          {@const sortedInt = [...internalAccts].sort((a, b) => (store.simData.finalBalances[b.id] || 0) - (store.simData.finalBalances[a.id] || 0))}
          {#each sortedInt as a (a.id)}
            {@const bal = store.simData.finalBalances[a.id] || 0}
            <div class="nw-row">
              <div class="nw-dot" style="background:{ACCT_COLORS[a.type]}"></div>
              <div class="nw-name">{a.name}</div>
              <div class="nw-val" style="color:{bal >= 0 ? 'var(--grn)' : 'var(--red)'}">{fmt2(bal)}</div>
              <div class="nw-pct">{kpis.finalNW > 0 ? (bal / kpis.finalNW * 100).toFixed(1) + '%' : ''}</div>
            </div>
          {/each}
          <div class="nw-row" style="border-top:2px solid var(--b2);margin-top:4px;padding-top:8px;font-weight:700;">
            <div class="nw-dot" style="background:transparent;"></div>
            <div class="nw-name" style="color:var(--t1);">Net Worth</div>
            <div class="nw-val" style="color:var(--grn)">{fmt2(kpis.finalNW)}</div>
            <div class="nw-pct">100%</div>
          </div>
          {@const extActive = externalAccts.filter((a) => (store.simData.finalBalances[a.id] || 0) !== 0).sort((a, b) => Math.abs(store.simData.finalBalances[b.id] || 0) - Math.abs(store.simData.finalBalances[a.id] || 0))}
          {#if extActive.length}
            <div style="font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:0.8px;color:var(--t4);margin:16px 0 6px;">External accounts ({kpis.months}mo totals)</div>
            {#each extActive as a (a.id)}
              {@const bal = store.simData.finalBalances[a.id] || 0}
              <div class="nw-row">
                <div class="nw-dot" style="background:{ACCT_COLORS[a.type] || '#6a7490'};opacity:0.5;"></div>
                <div class="nw-name" style="color:var(--t3);">{a.name}</div>
                <div class="nw-val" style="color:{bal > 0 ? 'var(--grn)' : 'var(--red)'};">{fmt2(Math.abs(bal))}</div>
              </div>
            {/each}
          {/if}
        {/if}
      </div>

      <div>
        <div class="dash-h">Monthly cash flow (checking)</div>
        <div class="dash-chart-wrap">
          {#if store.simData && chkId}
            <CashflowChart transfers={store.simData.allTransfers} checkingId={chkId} />
          {/if}
        </div>
      </div>

      <div>
        <div class="dash-h">Income waterfall (per group)</div>
        {#if waterfallGroups.length}
          {#each waterfallGroups as { g, grossM, netM, deductions } (g)}
            <div style="font-family:var(--mono);font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:0.5px;margin:12px 0 6px;font-weight:600;">{g}</div>
            <div class="wf-row">
              <div class="wf-label" style="font-weight:600;">Gross</div>
              <div class="wf-bar-wrap"><div class="wf-bar" style="width:100%;background:var(--grn);"></div></div>
              <div class="wf-val" style="color:var(--grn);">{fmt2(grossM)}</div>
            </div>
            {#each deductions as d}
              <div class="wf-row">
                <div class="wf-label">{d.name}</div>
                <div class="wf-bar-wrap"><div class="wf-bar" style="width:{d.pct.toFixed(1)}%;background:var(--red);"></div></div>
                <div class="wf-val" style="color:var(--red);">{fmt2(d.m)}</div>
                <div class="wf-pct">{d.pct.toFixed(1)}%</div>
              </div>
            {/each}
            <div class="wf-row wf-total">
              <div class="wf-label">Net pay</div>
              <div class="wf-bar-wrap"><div class="wf-bar" style="width:{grossM > 0 ? (netM / grossM * 100).toFixed(1) : 0}%;background:var(--grn);"></div></div>
              <div class="wf-val" style="color:var(--grn);">{fmt2(netM)}</div>
              <div class="wf-pct">{grossM > 0 ? (netM / grossM * 100).toFixed(1) : 0}%</div>
            </div>
          {/each}
        {:else}
          <div style="font-family:var(--mono);font-size:11px;color:var(--t4);">No grouped income flows. Add a group tag to flows to see the waterfall.</div>
        {/if}
      </div>

      <div>
        <div class="dash-h">Expense breakdown</div>
        {#each expenseCats.sorted as [cat, amt]}
          <div class="wf-row">
            <div class="wf-label" style="text-transform:capitalize;">{cat}</div>
            <div class="wf-bar-wrap"><div class="wf-bar" style="width:{(amt / expenseCats.max * 100).toFixed(1)}%;background:{CAT_COLORS[cat] || '#6a7490'};"></div></div>
            <div class="wf-val" style="color:var(--red);">{fmt2(amt)}</div>
          </div>
        {/each}
        <div class="wf-row wf-total">
          <div class="wf-label">Total</div>
          <div class="wf-bar-wrap"></div>
          <div class="wf-val" style="color:var(--red);">{fmt2(expenseCats.total)}</div>
        </div>
      </div>

      <div>
        <div class="dash-h">Linked positions (debt → asset)</div>
        {#if linkedPairs.length}
          {#each linkedPairs as { debt, asset, dBal, aBal, equity, ltv } (debt.id)}
            <div style="border:1px solid var(--b1);border-radius:6px;padding:12px;margin-bottom:8px;background:var(--s2);">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <span style="font-family:var(--mono);font-size:12px;font-weight:600;color:var(--t1);">{asset.name}</span>
                <span style="font-family:var(--mono);font-size:10px;padding:2px 6px;border-radius:3px;background:{equity >= 0 ? 'var(--grn2)' : 'var(--red2)'};color:{equity >= 0 ? 'var(--grn)' : 'var(--red)'};">
                  {equity >= 0 ? 'above water' : 'underwater'}
                </span>
              </div>
              <div class="nw-row" style="border:none;padding:2px 0;">
                <div class="nw-dot" style="background:{ACCT_COLORS[asset.type] || '#5b9cf6'};"></div>
                <div class="nw-name">Asset value</div>
                <div class="nw-val" style="color:var(--grn);">{fmt2(aBal)}</div>
              </div>
              <div class="nw-row" style="border:none;padding:2px 0;">
                <div class="nw-dot" style="background:{ACCT_COLORS[debt.type] || '#ef6461'};"></div>
                <div class="nw-name">{debt.name}</div>
                <div class="nw-val" style="color:var(--red);">{fmt2(dBal)}</div>
              </div>
              <div class="nw-row" style="border-top:1px solid var(--b2);margin-top:4px;padding-top:6px;font-weight:700;">
                <div class="nw-dot" style="background:transparent;"></div>
                <div class="nw-name" style="color:var(--t1);">Equity</div>
                <div class="nw-val" style="color:{equity >= 0 ? 'var(--grn)' : 'var(--red)'};">{fmt2(equity)}</div>
              </div>
              <div style="font-family:var(--mono);font-size:9px;color:var(--t4);margin-top:4px;">LTV: {ltv.toFixed(1)}%</div>
            </div>
          {/each}
        {/if}
        {#if unlinkedDebt.length}
          <div style="font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:var(--t4);margin:10px 0 6px;">Unlinked debt (no backing asset)</div>
          {#each unlinkedDebt as d (d.id)}
            {@const dBal = store.simData.finalBalances[d.id] || 0}
            <div class="nw-row" style="padding:3px 0;">
              <div class="nw-dot" style="background:var(--red);"></div>
              <div class="nw-name" style="color:var(--t3);">{d.name}</div>
              <div class="nw-val" style="color:var(--red);">{fmt2(dBal)}</div>
            </div>
          {/each}
        {/if}
        {#if !linkedPairs.length && !unlinkedDebt.length}
          <div style="font-family:var(--mono);font-size:11px;color:var(--t4);">No linked debt-asset pairs. Use "Linked to" in account settings.</div>
        {/if}
      </div>

      <div>
        <div class="dash-h">Portfolio by type</div>
        {#each groupedByType as { t, label, members, netBal, color } (t)}
          <div style="border:1px solid var(--b1);border-radius:6px;padding:12px;margin-bottom:8px;background:var(--s2);border-left:3px solid {color};">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:{members.length > 1 ? '8' : '0'}px;">
              <span style="font-family:var(--mono);font-size:12px;font-weight:600;color:var(--t1);">{label}</span>
              <span style="font-family:var(--mono);font-size:11px;font-weight:700;color:{netBal >= 0 ? 'var(--grn)' : 'var(--red)'};">{fmt2(netBal)}</span>
            </div>
            {#if members.length > 1}
              {#each members as a (a.id)}
                {@const bal = store.simData.finalBalances[a.id] || 0}
                <div class="nw-row" style="border:none;padding:2px 0;">
                  <div class="nw-dot" style="background:{color};"></div>
                  <div class="nw-name">{a.name}</div>
                  <div class="nw-val" style="color:{bal >= 0 ? 'var(--grn)' : 'var(--red)'};">{fmt2(bal)}</div>
                </div>
              {/each}
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>
