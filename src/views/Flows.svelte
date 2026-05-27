<script>
  import { store, openFlowModal, toggleFlow, deleteFlow } from '../lib/state.svelte.js';
  import { PER_LABELS, CAT_COLORS } from '../lib/constants.js';
  import { fmt2, toMonthlyAmt } from '../lib/format.js';

  let search = $state('');
  let groupFilter = $state('');
  let acctFilter = $state('');
  let sortMode = $state('group');
  let ctrlOpen = $state(false);
  let flowView = $state('list');

  const acctName = (id) => store.accounts.find((x) => x.id === id)?.name ?? '?';

  const internalAccts = $derived(store.accounts.filter((a) => !a.external));
  const externalAccts = $derived(store.accounts.filter((a) => a.external));

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

  const categories = $derived([...new Set(store.flows.map((f) => f.category))].sort());
  const groups = $derived([...new Set(store.flows.filter((f) => f.group).map((f) => f.group))].sort());

  const filtered = $derived.by(() => {
    const s = search.toLowerCase().trim();
    return store.flows.filter((fl) => {
      if (s &&
        !fl.name.toLowerCase().includes(s) &&
        !fl.category.toLowerCase().includes(s) &&
        !(fl.group || '').toLowerCase().includes(s) &&
        !acctName(fl.from).toLowerCase().includes(s) &&
        !acctName(fl.to).toLowerCase().includes(s)
      ) return false;
      if (store.flowCatFilter.size > 0 && !store.flowCatFilter.has(fl.category)) return false;
      if (groupFilter === '__none__' && fl.group) return false;
      if (groupFilter && groupFilter !== '__none__' && fl.group !== groupFilter) return false;
      if (acctFilter && fl.from !== acctFilter && fl.to !== acctFilter) return false;
      return true;
    });
  });

  const grouped = $derived.by(() => {
    if (sortMode !== 'group') return null;
    const gNames = [...new Set(filtered.filter((f) => f.group).map((f) => f.group))].sort();
    const ungrouped = filtered.filter((f) => !f.group);
    const groupsArr = gNames.map((g) => {
      const gFlows = filtered.filter((f) => f.group === g);
      const gNet = gFlows.filter((f) => f.enabled).reduce((s, f) => {
        const m = toMonthlyAmt(f);
        const fromExt = store.accounts.find((a) => a.id === f.from)?.external;
        const toExt = store.accounts.find((a) => a.id === f.to)?.external;
        if (!toExt && fromExt) return s + m;
        if (!fromExt && toExt) return s - m;
        return s;
      }, 0);
      return { g, flows: gFlows, net: gNet };
    });
    const ugNet = ungrouped.filter((f) => f.enabled).reduce((s, f) => {
      const m = toMonthlyAmt(f);
      const fromExt = store.accounts.find((a) => a.id === f.from)?.external;
      const toExt = store.accounts.find((a) => a.id === f.to)?.external;
      if (!toExt && fromExt) return s + m;
      if (!fromExt && toExt) return s - m;
      return s;
    }, 0);
    return { groupsArr, ungrouped, ugNet };
  });

  const flat = $derived.by(() => {
    if (sortMode === 'group') return null;
    const list = [...filtered];
    if (sortMode === 'amount-desc') list.sort((a, b) => b.amount - a.amount);
    else if (sortMode === 'amount-asc') list.sort((a, b) => a.amount - b.amount);
    else if (sortMode === 'name-asc') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortMode === 'name-desc') list.sort((a, b) => b.name.localeCompare(a.name));
    else if (sortMode === 'category') list.sort((a, b) => a.category.localeCompare(b.category) || b.amount - a.amount);
    else if (sortMode === 'from') list.sort((a, b) => acctName(a.from).localeCompare(acctName(b.from)));
    else if (sortMode === 'to') list.sort((a, b) => acctName(a.to).localeCompare(acctName(b.to)));
    return list;
  });

  function toggleCat(c) {
    const next = new Set(store.flowCatFilter);
    if (next.has(c)) next.delete(c); else next.add(c);
    store.flowCatFilter = next;
  }

  function toggleGroup(g) {
    const next = new Set(store.expandedGroups);
    if (next.has(g)) next.delete(g); else next.add(g);
    store.expandedGroups = next;
  }

  function confirmDelete(fl) {
    if (confirm(`Delete flow "${fl.name}"?`)) deleteFlow(fl.id);
  }

  function flowKind(fl) {
    const fromAcct = store.accounts.find((a) => a.id === fl.from);
    const toAcct = store.accounts.find((a) => a.id === fl.to);
    const isExpense = fromAcct && !fromAcct.external && toAcct && toAcct.external;
    const isDeduction = fromAcct && fromAcct.external && toAcct && toAcct.external;
    return { isExpense, isDeduction, negative: isExpense || isDeduction };
  }

  const activeFilterCount = $derived(
    (search ? 1 : 0) +
    store.flowCatFilter.size +
    (groupFilter ? 1 : 0) +
    (acctFilter ? 1 : 0) +
    (sortMode !== 'group' ? 1 : 0)
  );
</script>

<div class="view active" style="flex-direction:column;overflow:hidden;">
  <div class="flows-wrap">
    <div class="view-toolbar">
      <div class="vt-tabs">
        <button class="sb-filter" class:active={flowView === 'list'} onclick={() => flowView = 'list'}>List</button>
        <button class="sb-filter" class:active={flowView === 'income'} onclick={() => flowView = 'income'}>Income</button>
        <button class="sb-filter" class:active={flowView === 'expenses'} onclick={() => flowView = 'expenses'}>Expenses</button>
      </div>
      <div class="vt-actions">
        {#if flowView === 'list'}
          <button type="button" class="ctrl-toggle" onclick={() => ctrlOpen = !ctrlOpen}>
            <span>Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}</span>
            <span class="ctrl-toggle-caret">{ctrlOpen ? '▴' : '▾'}</span>
          </button>
        {/if}
        <button class="act" onclick={() => openFlowModal()}>+ Add</button>
      </div>
    </div>
    {#if flowView === 'list'}
    <div class="ctrl-body" class:open={ctrlOpen} style="flex-direction:column;align-items:stretch;">
      <input type="text" bind:value={search} placeholder="Search flows..." style="width:100%;" />
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <div style="display:flex;gap:3px;flex-wrap:wrap;">
          {#each categories as c (c)}
            <button class="sb-filter" class:active={store.flowCatFilter.has(c)} onclick={() => toggleCat(c)}>{c}</button>
          {/each}
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <select bind:value={groupFilter} style="font-size:10px;padding:3px 6px;width:auto;">
            <option value="">All groups</option>
            <option value="__none__">Ungrouped</option>
            {#each groups as g (g)}
              <option value={g}>{g}</option>
            {/each}
          </select>
          <select bind:value={acctFilter} style="font-size:10px;padding:3px 6px;width:auto;">
            <option value="">All accounts</option>
            {#each store.accounts as a (a.id)}
              <option value={a.id}>{a.name}{a.external ? ' (ext)' : ''}</option>
            {/each}
          </select>
          <select bind:value={sortMode} style="font-size:10px;padding:3px 6px;width:auto;">
            <option value="group">Group</option>
            <option value="amount-desc">Amount ↓</option>
            <option value="amount-asc">Amount ↑</option>
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
            <option value="category">Category</option>
            <option value="from">Source</option>
            <option value="to">Destination</option>
          </select>
        </div>
      </div>
    </div>

    {#snippet flowCard(fl)}
      {@const kind = flowKind(fl)}
      <div class="fl-card" class:disabled={!fl.enabled}>
        <div class="fc-top">
          <div class="fc-name">{fl.name}</div>
          <div class="fc-amt" class:pos={!kind.negative} class:neg={kind.negative}>{kind.negative ? '-' : ''}{fmt2(fl.amount)}</div>
        </div>
        <div class="fc-meta">
          {acctName(fl.from)}<span class="fc-arrow">→</span>{acctName(fl.to)}
        </div>
        <div class="fc-tags">
          <span class="fc-tag">{fl.category}</span>
          <span class="fc-tag">{PER_LABELS[fl.period] || fl.period}</span>
          {#if fl.group}<span class="fc-tag">{fl.group}</span>{/if}
        </div>
        <div class="fc-actions">
          <button onclick={() => openFlowModal(fl.id)}>Edit</button>
          <button onclick={() => toggleFlow(fl.id)}>{fl.enabled ? 'Disable' : 'Enable'}</button>
          <button class="del" onclick={() => confirmDelete(fl)}>Delete</button>
        </div>
      </div>
    {/snippet}

    {#snippet flowRow(fl)}
      {@const kind = flowKind(fl)}
      <tr style={!fl.enabled ? 'opacity:0.4' : ''}>
        <td class="fl-name">{fl.name}</td>
        <td class="fl-src">{acctName(fl.from)}</td>
        <td style="color:var(--t4)">→</td>
        <td class="fl-dst">{acctName(fl.to)}</td>
        <td class="fl-amt" class:pos={!kind.negative} class:neg={kind.negative}>{kind.negative ? '-' : ''}{fmt2(fl.amount)}</td>
        <td class="fl-period">{PER_LABELS[fl.period] || fl.period}</td>
        <td style="color:var(--t3)">{fl.category}</td>
        <td class="fl-actions">
          <button onclick={() => openFlowModal(fl.id)}>Edit</button>
          <button onclick={() => toggleFlow(fl.id)}>{fl.enabled ? 'Off' : 'On'}</button>
          <button class="del" onclick={() => confirmDelete(fl)}>✕</button>
        </td>
      </tr>
    {/snippet}

    {#snippet flowGroupRow(key, label, count, net)}
      {@const expanded = store.expandedGroups.has(key)}
      <tr class="tbl-group-row" role="button" tabindex="0" onclick={() => toggleGroup(key)} onkeydown={(e) => e.key === 'Enter' && toggleGroup(key)}>
        <td colspan="8">
          <div class="tbl-group-content">
            <div><span class="fg-toggle" class:open={expanded}>▶</span> {label} <span class="tbl-group-count">{count} flow{count !== 1 ? 's' : ''}</span></div>
            <div class="fg-sum" class:pos={net >= 0} class:neg={net < 0}>net {net >= 0 ? '+' : ''}{fmt2(net)}/mo</div>
          </div>
        </td>
      </tr>
    {/snippet}

    <div class="fl-table-wrap" style="overflow-y:auto;flex:1;">
      <table class="fl-table">
        <thead>
          <tr>
            <th>Name</th><th>From</th><th></th><th>To</th>
            <th style="text-align:right">Amount</th><th>Period</th><th>Category</th><th></th>
          </tr>
        </thead>
        <tbody>
          {#if grouped}
            {#each grouped.groupsArr as { g, flows, net } (g)}
              {@render flowGroupRow(g, g.toUpperCase(), flows.length, net)}
              {#if store.expandedGroups.has(g)}
                {#each flows as fl (fl.id)}
                  {@render flowRow(fl)}
                {/each}
              {/if}
            {/each}
            {#if grouped.ungrouped.length > 0}
              {@render flowGroupRow('__ungrouped__', 'UNGROUPED', grouped.ungrouped.length, grouped.ugNet)}
              {#if store.expandedGroups.has('__ungrouped__')}
                {#each grouped.ungrouped as fl (fl.id)}
                  {@render flowRow(fl)}
                {/each}
              {/if}
            {/if}
            {#if filtered.length === 0}
              <tr><td colspan="8" style="text-align:center;color:var(--t4);padding:24px;">No flows match filters</td></tr>
            {/if}
          {:else}
            {#each flat as fl (fl.id)}
              {@render flowRow(fl)}
            {/each}
            {#if flat.length === 0}
              <tr><td colspan="8" style="text-align:center;color:var(--t4);padding:24px;">No flows match filters</td></tr>
            {/if}
          {/if}
        </tbody>
      </table>
    </div>

    <div class="fl-cards" style="overflow-y:auto;flex:1;padding-top:10px;">
      {#if grouped}
        {#each grouped.groupsArr as { g, flows, net } (g)}
          {@const collapsed = !store.expandedGroups.has(g)}
          <div class="fl-group-header" role="button" tabindex="0" onclick={() => toggleGroup(g)} onkeydown={(e) => e.key === 'Enter' && toggleGroup(g)}>
            <div><span class="fg-toggle" class:open={!collapsed}>▶</span> {g.toUpperCase()} <span style="color:var(--t4);font-size:9px;margin-left:6px;">{flows.length}</span></div>
            <div class="fg-sum" class:pos={net >= 0} class:neg={net < 0}>{net >= 0 ? '+' : ''}{fmt2(net)}/mo</div>
          </div>
          {#if !collapsed}
            <div style="padding-top:8px;">
              {#each flows as fl (fl.id)}
                {@render flowCard(fl)}
              {/each}
            </div>
          {/if}
        {/each}
        {#if grouped.ungrouped.length > 0}
          {@const collapsed = !store.expandedGroups.has('__ungrouped__')}
          <div class="fl-group-header" role="button" tabindex="0" onclick={() => toggleGroup('__ungrouped__')} onkeydown={(e) => e.key === 'Enter' && toggleGroup('__ungrouped__')}>
            <div><span class="fg-toggle" class:open={!collapsed}>▶</span> UNGROUPED <span style="color:var(--t4);font-size:9px;margin-left:6px;">{grouped.ungrouped.length}</span></div>
            <div class="fg-sum" class:pos={grouped.ugNet >= 0} class:neg={grouped.ugNet < 0}>{grouped.ugNet >= 0 ? '+' : ''}{fmt2(grouped.ugNet)}/mo</div>
          </div>
          {#if !collapsed}
            <div style="padding-top:8px;">
              {#each grouped.ungrouped as fl (fl.id)}
                {@render flowCard(fl)}
              {/each}
            </div>
          {/if}
        {/if}
        {#if filtered.length === 0}
          <div style="text-align:center;color:var(--t4);padding:24px;font-family:var(--mono);font-size:11px;">No flows match filters</div>
        {/if}
      {:else}
        {#each flat as fl (fl.id)}
          {@render flowCard(fl)}
        {/each}
        {#if flat.length === 0}
          <div style="text-align:center;color:var(--t4);padding:24px;font-family:var(--mono);font-size:11px;">No flows match filters</div>
        {/if}
      {/if}
    </div>
    {:else if flowView === 'income'}
      <div class="dash-scroll">
        <div class="dash-panel">
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
      </div>
    {:else if flowView === 'expenses'}
      <div class="dash-scroll">
        <div class="dash-panel">
          <div class="dash-h">Expense breakdown</div>
          {#if expenseCats.sorted.length}
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
          {:else}
            <div style="font-family:var(--mono);font-size:11px;color:var(--t4);">No expense flows yet.</div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>
