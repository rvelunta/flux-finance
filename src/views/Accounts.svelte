<script>
  import { store, openAccountModal, openScheduleModal, deleteAccount } from '../lib/state.svelte.js';
  import { ACCT_COLORS, TYPE_LABELS } from '../lib/constants.js';
  import { fmt2 } from '../lib/format.js';
  import AccountCard from '../components/AccountCard.svelte';
  import { isMobile } from '../lib/platform.js';
  import { fly, fade } from 'svelte/transition';

  let search = $state('');
  let showMode = $state('all');
  let sortMode = $state('type');
  let ctrlOpen = $state(false);
  let filterSheetOpen = $state(false);
  let acctView = $state('list');
  let expandedAcctGroups = $state(new Set());

  function toggleAcctGroup(key) {
    const next = new Set(expandedAcctGroups);
    if (next.has(key)) next.delete(key); else next.add(key);
    expandedAcctGroups = next;
  }

  function confirmDelete(a) {
    const connected = store.flows.filter((f) => f.from === a.id || f.to === a.id);
    let msg = `Delete "${a.name}"?`;
    if (connected.length) msg += `\n\n${connected.length} flow${connected.length !== 1 ? 's' : ''} reference this account and will be orphaned.`;
    if (confirm(msg)) deleteAccount(a.id);
  }

  const internalAccts = $derived(store.accounts.filter((a) => !a.external));

  const portfolioGroups = $derived.by(() => {
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

  const types = $derived([...new Set(store.accounts.map((a) => a.type))]);

  const filtered = $derived.by(() => {
    const s = search.toLowerCase().trim();
    return store.accounts.filter((a) => {
      if (s && !a.name.toLowerCase().includes(s) && !(a.type || '').toLowerCase().includes(s)) return false;
      if (store.acctTypeFilter.size > 0 && !store.acctTypeFilter.has(a.type)) return false;
      if (showMode === 'internal' && a.external) return false;
      if (showMode === 'external' && !a.external) return false;
      return true;
    });
  });

  const sorted = $derived.by(() => {
    if (sortMode === 'type') return null;
    const list = [...filtered];
    if (sortMode === 'balance-desc') list.sort((a, b) => b.balance - a.balance);
    else if (sortMode === 'balance-asc') list.sort((a, b) => a.balance - b.balance);
    else if (sortMode === 'name-asc') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortMode === 'rate-desc') list.sort((a, b) => (b.annualRate || 0) - (a.annualRate || 0));
    return list;
  });

  const typeGrouped = $derived.by(() => {
    if (sortMode !== 'type') return null;
    const typeOrder = ['checking', 'savings', 'retirement', 'hsa', 'brokerage', 'property', 'crypto', 'debt'];
    const labels = { checking: 'Cash', savings: 'Savings', retirement: 'Retirement', hsa: 'HSA', brokerage: 'Brokerage', property: 'Real Estate', crypto: 'Crypto', debt: 'Debt' };
    const internal = filtered.filter((a) => !a.external);
    const external = filtered.filter((a) => a.external);
    const byType = {};
    internal.forEach((a) => {
      if (!byType[a.type]) byType[a.type] = [];
      byType[a.type].push(a);
    });
    const orderedTypes = [
      ...typeOrder.filter((t) => byType[t]?.length),
      ...Object.keys(byType).filter((t) => !typeOrder.includes(t)),
    ];
    const internalGroups = orderedTypes.map((t) => {
      const members = [...byType[t]].sort((a, b) => b.balance - a.balance);
      const sum = members.reduce((s, a) => s + a.balance, 0);
      return { t, label: labels[t] || TYPE_LABELS[t] || t, members, sum };
    });
    return { internalGroups, external };
  });

  function toggleType(t) {
    const next = new Set(store.acctTypeFilter);
    if (next.has(t)) next.delete(t); else next.add(t);
    store.acctTypeFilter = next;
  }

  const activeFilterCount = $derived(
    (search ? 1 : 0) +
    store.acctTypeFilter.size +
    (showMode !== 'all' ? 1 : 0) +
    (sortMode !== 'type' ? 1 : 0)
  );
</script>

<div class="view active" style="flex-direction:column;overflow:hidden;">
  <div class="view-toolbar">
    <div class="vt-tabs">
      <button class="sb-filter" class:active={acctView === 'list'} onclick={() => acctView = 'list'}>List</button>
      <button class="sb-filter" class:active={acctView === 'portfolio'} onclick={() => acctView = 'portfolio'}>Portfolio</button>
      <button class="sb-filter" class:active={acctView === 'linked'} onclick={() => acctView = 'linked'}>Linked</button>
    </div>
    <div class="vt-actions">
      {#if acctView === 'list'}
        <button type="button" class="ctrl-toggle" onclick={() => { if (isMobile) filterSheetOpen = true; else ctrlOpen = !ctrlOpen; }}>
          <span>Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}</span>
          <span class="ctrl-toggle-caret">{(isMobile ? filterSheetOpen : ctrlOpen) ? '▴' : '▾'}</span>
        </button>
      {/if}
      <button class="act" onclick={() => openAccountModal()}>+ Add</button>
    </div>
  </div>
  {#if acctView === 'list'}
  {#if !isMobile}
  <div class="ctrl-body" class:open={ctrlOpen}>
    <input type="text" bind:value={search} placeholder="Search accounts..." style="width:180px;" />
    <div style="display:flex;gap:3px;flex-wrap:wrap;">
      {#each types as t (t)}
        {@const on = store.acctTypeFilter.has(t)}
        {@const col = ACCT_COLORS[t] || '#6a7490'}
        <button
          class="chip"
          class:on
          style="{on ? `border-color:${col};color:${col};background:${col}18` : ''}"
          onclick={() => toggleType(t)}
        >
          {TYPE_LABELS[t] || t}
        </button>
      {/each}
    </div>
    <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <select bind:value={showMode} style="font-size:10px;padding:3px 6px;width:auto;">
        <option value="all">All</option>
        <option value="internal">Internal only</option>
        <option value="external">External only</option>
      </select>
      <select bind:value={sortMode} style="font-size:10px;padding:3px 6px;width:auto;">
        <option value="type">Type</option>
        <option value="balance-desc">Balance ↓</option>
        <option value="balance-asc">Balance ↑</option>
        <option value="name-asc">Name A-Z</option>
        <option value="rate-desc">Rate ↓</option>
      </select>
    </div>
  </div>
  {/if}

  {#if isMobile && filterSheetOpen}
    <div class="sheet-overlay" transition:fade={{ duration: 150 }} onclick={() => (filterSheetOpen = false)} role="presentation">
      <div class="sheet" transition:fly={{ y: 320, duration: 240 }} onclick={(e) => e.stopPropagation()}>
        <div class="sheet-grab"></div>
        <input type="text" class="sheet-search" bind:value={search} placeholder="Search accounts…" />
        <div class="sheet-sec-label">Type</div>
        <div class="sheet-chips">
          {#each types as t (t)}
            {@const on = store.acctTypeFilter.has(t)}
            {@const col = ACCT_COLORS[t] || '#6a7490'}
            <button type="button" class="sheet-chip" class:active={on} style={on ? `border-color:${col};color:${col};background:${col}1f` : ''} onclick={() => toggleType(t)}>{TYPE_LABELS[t] || t}</button>
          {/each}
        </div>
        <div class="sheet-divider"></div>
        <div class="sheet-sec-label">Show</div>
        <div class="sheet-chips">
          <button type="button" class="sheet-chip" class:active={showMode === 'all'} onclick={() => (showMode = 'all')}>All</button>
          <button type="button" class="sheet-chip" class:active={showMode === 'internal'} onclick={() => (showMode = 'internal')}>Internal</button>
          <button type="button" class="sheet-chip" class:active={showMode === 'external'} onclick={() => (showMode = 'external')}>External</button>
        </div>
        <div class="sheet-divider"></div>
        <div class="sheet-field">
          <span class="sheet-field-l">Sort by</span>
          <select bind:value={sortMode}>
            <option value="type">Type</option>
            <option value="balance-desc">Balance ↓</option>
            <option value="balance-asc">Balance ↑</option>
            <option value="name-asc">Name A-Z</option>
            <option value="rate-desc">Rate ↓</option>
          </select>
        </div>
      </div>
    </div>
  {/if}

  {#snippet acctRow(a)}
    <tr>
      <td class="fl-name">
        {a.name}
        {#if a.annualRate}
          <span style="font-size:9px;font-family:var(--mono);color:{a.annualRate > 0 && a.balance < 0 ? 'var(--red)' : 'var(--grn)'};margin-left:6px;">{(a.annualRate * 100).toFixed(2)}% APR</span>
        {/if}
      </td>
      <td><span class="ac-type type-{a.type}" style="font-size:9px;font-family:var(--mono);padding:2px 6px;border-radius:3px;text-transform:uppercase;letter-spacing:0.5px;">{TYPE_LABELS[a.type] || a.type}{a.external ? ' · ext' : ''}</span></td>
      <td class="fl-amt" style="color:{a.external ? 'var(--t3)' : a.balance >= 0 ? 'var(--grn)' : 'var(--red)'};">{a.external ? '$0.00' : fmt2(a.balance)}</td>
      <td class="fl-actions">
        <button onclick={() => openAccountModal(a.id)}>Edit</button>
        {#if a.annualRate && !a.external && store.simData}
          <button onclick={() => openScheduleModal(a.id)}>Sched</button>
        {/if}
        <button class="del" onclick={() => confirmDelete(a)}>✕</button>
      </td>
    </tr>
  {/snippet}

  {#snippet groupRow(key, label, count, sum)}
    {@const expanded = expandedAcctGroups.has(key)}
    <tr class="tbl-group-row" role="button" tabindex="0" onclick={() => toggleAcctGroup(key)} onkeydown={(e) => e.key === 'Enter' && toggleAcctGroup(key)}>
      <td colspan="4">
        <div class="tbl-group-content">
          <div><span class="fg-toggle" class:open={expanded}>▶</span> {label.toUpperCase()} <span class="tbl-group-count">{count} acct{count !== 1 ? 's' : ''}</span></div>
          {#if sum !== undefined}
            <div class="fg-sum" class:pos={sum >= 0} class:neg={sum < 0}>{fmt2(sum)}</div>
          {/if}
        </div>
      </td>
    </tr>
  {/snippet}

  <div class="accts-table-wrap" style="overflow-y:auto;flex:1;">
    <table class="fl-table accts-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th style="text-align:right">Balance</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#if typeGrouped}
          {#each typeGrouped.internalGroups as group (group.t)}
            {@render groupRow(group.t, group.label, group.members.length, group.sum)}
            {#if expandedAcctGroups.has(group.t)}
              {#each group.members as a (a.id)}
                {@render acctRow(a)}
              {/each}
            {/if}
          {/each}
          {#if typeGrouped.external.length}
            {@render groupRow('__external__', 'External', typeGrouped.external.length, undefined)}
            {#if expandedAcctGroups.has('__external__')}
              {#each typeGrouped.external as a (a.id)}
                {@render acctRow(a)}
              {/each}
            {/if}
          {/if}
          {#if !filtered.length}
            <tr><td colspan="4" style="text-align:center;color:var(--t4);padding:24px;">No accounts match filters</td></tr>
          {/if}
        {:else}
          {#each sorted as a (a.id)}
            {@render acctRow(a)}
          {/each}
          {#if !sorted.length}
            <tr><td colspan="4" style="text-align:center;color:var(--t4);padding:24px;">No accounts match filters</td></tr>
          {/if}
        {/if}
      </tbody>
    </table>
  </div>

  <div class="accts-grid" style="overflow-y:auto;flex:1;">
    {#if typeGrouped}
      {#each typeGrouped.internalGroups as group (group.t)}
        {#each group.members as a (a.id)}
          <AccountCard account={a} />
        {/each}
      {/each}
      {#if typeGrouped.external.length}
        <div style="grid-column:1/-1;font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:var(--t4);padding-top:8px;">External accounts</div>
        {#each typeGrouped.external as a (a.id)}
          <AccountCard account={a} />
        {/each}
      {/if}
      {#if !filtered.length}
        <div style="grid-column:1/-1;text-align:center;color:var(--t4);font-family:var(--mono);font-size:11px;padding:40px;">No accounts match filters</div>
      {/if}
    {:else}
      {#each sorted as a (a.id)}
        <AccountCard account={a} />
      {/each}
      {#if !sorted.length}
        <div style="grid-column:1/-1;text-align:center;color:var(--t4);font-family:var(--mono);font-size:11px;padding:40px;">No accounts match filters</div>
      {/if}
    {/if}
  </div>
  {:else if acctView === 'portfolio'}
    <div class="dash-scroll">
      <div class="dash-panel">
        <div class="dash-h">Portfolio by type</div>
        {#each portfolioGroups as { t, label, members, netBal, color } (t)}
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
        {#if !portfolioGroups.length}
          <div style="font-family:var(--mono);font-size:11px;color:var(--t4);">Run a projection on the Projection tab to populate the portfolio.</div>
        {/if}
      </div>
    </div>
  {:else if acctView === 'linked'}
    <div class="dash-scroll">
      <div class="dash-panel">
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
    </div>
  {/if}
</div>
