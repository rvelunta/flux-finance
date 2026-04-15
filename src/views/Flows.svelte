<script>
  import { store, openFlowModal, toggleFlow, deleteFlow } from '../lib/state.svelte.js';
  import { PER_LABELS } from '../lib/constants.js';
  import { fmt2, toMonthlyAmt } from '../lib/format.js';

  let search = $state('');
  let groupFilter = $state('');
  let acctFilter = $state('');
  let sortMode = $state('group');

  const acctName = (id) => store.accounts.find((x) => x.id === id)?.name ?? '?';

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
</script>

<div class="view active" style="flex-direction:column;overflow:hidden;">
  <div class="flows-wrap">
    <div class="flows-toolbar">
      <h3>Flows ({filtered.length}{filtered.length !== store.flows.length ? ' / ' + store.flows.length : ''})</h3>
      <button class="act" onclick={() => openFlowModal()}>+ Add Flow</button>
    </div>
    <div style="padding:10px 28px 10px;border-bottom:1px solid var(--b1);background:var(--s1);display:flex;flex-direction:column;gap:8px;">
      <input type="text" bind:value={search} placeholder="Search flows..." style="width:100%;font-size:12px;padding:6px 10px;" />
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <div style="display:flex;gap:3px;flex-wrap:wrap;">
          {#each categories as c (c)}
            <button class="sb-filter" class:active={store.flowCatFilter.has(c)} onclick={() => toggleCat(c)}>{c}</button>
          {/each}
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center;">
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

    <div style="overflow-y:auto;flex:1;">
      {#if grouped}
        {#each grouped.groupsArr as { g, flows, net } (g)}
          {@const collapsed = !store.expandedGroups.has(g)}
          <div class="fl-group-header" role="button" tabindex="0" onclick={() => toggleGroup(g)} onkeydown={(e) => e.key === 'Enter' && toggleGroup(g)}>
            <div><span class="fg-toggle" class:open={!collapsed}>▶</span> {g.toUpperCase()} <span style="color:var(--t4);font-size:9px;margin-left:6px;">{flows.length} flows</span></div>
            <div class="fg-sum" class:pos={net >= 0} class:neg={net < 0}>net {net >= 0 ? '+' : ''}{fmt2(net)}/mo</div>
          </div>
          {#if !collapsed}
            <table class="fl-table">
              <tbody>
                {#each flows as fl (fl.id)}
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
                {/each}
              </tbody>
            </table>
          {/if}
        {/each}

        {#if grouped.ungrouped.length > 0}
          {@const collapsed = !store.expandedGroups.has('__ungrouped__')}
          <div class="fl-group-header" role="button" tabindex="0" onclick={() => toggleGroup('__ungrouped__')} onkeydown={(e) => e.key === 'Enter' && toggleGroup('__ungrouped__')}>
            <div><span class="fg-toggle" class:open={!collapsed}>▶</span> UNGROUPED <span style="color:var(--t4);font-size:9px;margin-left:6px;">{grouped.ungrouped.length} flows</span></div>
            <div class="fg-sum" class:pos={grouped.ugNet >= 0} class:neg={grouped.ugNet < 0}>net {grouped.ugNet >= 0 ? '+' : ''}{fmt2(grouped.ugNet)}/mo</div>
          </div>
          {#if !collapsed}
            <table class="fl-table">
              <tbody>
                {#each grouped.ungrouped as fl (fl.id)}
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
                {/each}
              </tbody>
            </table>
          {/if}
        {/if}

        {#if filtered.length === 0}
          <div style="text-align:center;color:var(--t4);padding:24px;font-family:var(--mono);font-size:11px;">No flows match filters</div>
        {/if}
      {:else}
        <table class="fl-table">
          <thead>
            <tr>
              <th>Name</th><th>From</th><th></th><th>To</th>
              <th style="text-align:right">Amount</th><th>Period</th><th>Category</th><th></th>
            </tr>
          </thead>
          <tbody>
            {#each flat as fl (fl.id)}
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
            {/each}
            {#if flat.length === 0}
              <tr><td colspan="8" style="text-align:center;color:var(--t4);padding:24px;">No flows match filters</td></tr>
            {/if}
          </tbody>
        </table>
      {/if}
    </div>
  </div>
</div>
