<script>
  import { store, openAccountModal } from '../lib/state.svelte.js';
  import { ACCT_COLORS, TYPE_LABELS } from '../lib/constants.js';
  import AccountCard from '../components/AccountCard.svelte';

  let search = $state('');
  let showMode = $state('all');
  let sortMode = $state('type');

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

  const getBal = (a) =>
    store.simData && store.simData.finalBalances[a.id] !== undefined
      ? store.simData.finalBalances[a.id]
      : (a.external ? 0 : a.balance);

  const sorted = $derived.by(() => {
    if (sortMode === 'type') return null;
    const list = [...filtered];
    if (sortMode === 'balance-desc') list.sort((a, b) => b.balance - a.balance);
    else if (sortMode === 'balance-asc') list.sort((a, b) => a.balance - b.balance);
    else if (sortMode === 'name-asc') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortMode === 'projected-desc') list.sort((a, b) => getBal(b) - getBal(a));
    else if (sortMode === 'rate-desc') list.sort((a, b) => (b.annualRate || 0) - (a.annualRate || 0));
    return list;
  });

  const typeGrouped = $derived.by(() => {
    if (sortMode !== 'type') return null;
    return {
      internal: filtered.filter((a) => !a.external),
      external: filtered.filter((a) => a.external),
    };
  });

  function toggleType(t) {
    const next = new Set(store.acctTypeFilter);
    if (next.has(t)) next.delete(t); else next.add(t);
    store.acctTypeFilter = next;
  }
</script>

<div class="view active" style="flex-direction:column;overflow:hidden;">
  <div class="ctrl">
    <button class="act" onclick={() => openAccountModal()}>+ Add Account</button>
  </div>
  <div style="padding:10px 28px;border-bottom:1px solid var(--b1);background:var(--s1);display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
    <input type="text" bind:value={search} placeholder="Search accounts..." style="width:180px;font-size:12px;padding:6px 10px;" />
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
    <div style="margin-left:auto;display:flex;gap:8px;align-items:center;">
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
        <option value="projected-desc">Projected ↓</option>
        <option value="rate-desc">Rate ↓</option>
      </select>
    </div>
  </div>

  <div class="accts-grid" style="overflow-y:auto;flex:1;">
    {#if typeGrouped}
      {#each typeGrouped.internal as a (a.id)}
        <AccountCard account={a} />
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
</div>
