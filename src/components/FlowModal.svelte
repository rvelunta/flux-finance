<script>
  import { store, ui, closeFlowModal, addFlow, updateFlow, saveLS } from '../lib/state.svelte.js';
  import { DEFAULT_FLOW_CATS } from '../lib/constants.js';

  const editing = $derived(ui.flowModal?.id ? store.flows.find((f) => f.id === ui.flowModal.id) : null);

  let name = $state('');
  let from = $state('a-chk');
  let to = $state('');
  let amount = $state('');
  let period = $state('monthly');
  let start = $state('');
  let end = $state('');
  let category = $state('other');
  let group = $state('');
  let enabled = $state(true);
  let addingCat = $state(false);
  let newCatName = $state('');

  const allCats = $derived.by(() => {
    const fromFlows = store.flows.map((f) => f.category).filter((c) => c && !DEFAULT_FLOW_CATS.includes(c));
    return [...new Set([...DEFAULT_FLOW_CATS, ...store.customFlowCats, ...fromFlows])];
  });

  const catDisplay = (c) =>
    store.flowCatDisplay[c] || (c.charAt(0).toUpperCase() + c.slice(1));

  let initialized = false;
  $effect(() => {
    if (!ui.flowModal || initialized) return;
    initialized = true;
    if (editing) {
      name = editing.name;
      from = editing.from;
      to = editing.to;
      amount = editing.amount;
      period = editing.period;
      start = editing.start;
      end = editing.end || '';
      category = editing.category;
      group = editing.group || '';
      enabled = editing.enabled;
    } else {
      name = '';
      from = 'a-chk';
      const firstExt = store.accounts.find((a) => a.external);
      to = firstExt ? firstExt.id : 'a-chk';
      amount = '';
      period = 'monthly';
      start = store.config.startDate;
      end = '';
      category = 'other';
      group = '';
      enabled = true;
    }
  });

  function confirmNewCat() {
    const n = newCatName.trim();
    if (!n) return;
    const slug = n.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (!allCats.includes(slug)) {
      store.customFlowCats.push(slug);
      store.flowCatDisplay[slug] = n;
      saveLS();
    }
    category = slug;
    addingCat = false;
    newCatName = '';
  }

  function save() {
    if (!name.trim() || !amount || !start) return;
    const patch = {
      name: name.trim(),
      from,
      to,
      amount: parseFloat(amount) || 0,
      period,
      start,
      end: period === 'once' ? null : (end || null),
      category,
      group: group.trim().toLowerCase() || null,
      enabled,
    };
    if (editing) updateFlow(editing.id, patch);
    else addFlow(patch);
    closeFlowModal();
  }

  function onEnter(e) { if (e.key === 'Enter' && !addingCat) save(); }
  function onBackdrop(e) { if (e.target === e.currentTarget) closeFlowModal(); }

  const internalOpts = $derived(store.accounts.filter((a) => !a.external));
  const externalOpts = $derived(store.accounts.filter((a) => a.external));
</script>

<div class="modal-overlay" role="presentation" onclick={onBackdrop}>
  <div class="modal" role="dialog">
    <h3>{editing ? 'Edit flow' : 'Add flow'}</h3>

    <div class="fr full">
      <div>
        <label for="fmName">Name</label>
        <input id="fmName" bind:value={name} placeholder="e.g. Boeing Net Pay" onkeydown={onEnter} />
      </div>
    </div>

    <div class="fr">
      <div>
        <label for="fmFrom">From</label>
        <select id="fmFrom" bind:value={from}>
          <optgroup label="Internal">
            {#each internalOpts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
          </optgroup>
          <optgroup label="External">
            {#each externalOpts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
          </optgroup>
        </select>
      </div>
      <div>
        <label for="fmTo">To</label>
        <select id="fmTo" bind:value={to}>
          <optgroup label="Internal">
            {#each internalOpts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
          </optgroup>
          <optgroup label="External">
            {#each externalOpts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
          </optgroup>
        </select>
      </div>
    </div>

    <div class="fr">
      <div>
        <label for="fmAmt">Amount</label>
        <input id="fmAmt" type="number" step="0.01" bind:value={amount} onkeydown={onEnter} />
      </div>
      <div>
        <label for="fmPeriod">Period</label>
        <select id="fmPeriod" bind:value={period}>
          <option value="once">One-Time</option>
          <option value="7">Weekly</option>
          <option value="14">Biweekly</option>
          <option value="semi-monthly">Semi-Monthly</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="annual">Annual</option>
        </select>
      </div>
    </div>

    <div class="fr">
      <div>
        <label for="fmStart">Start Date</label>
        <input id="fmStart" type="date" bind:value={start} />
      </div>
      <div>
        <label for="fmEnd">End Date (opt)</label>
        <input id="fmEnd" type="date" bind:value={end} />
      </div>
    </div>

    <div class="fr triple">
      <div>
        <label for="fmCat">Category</label>
        <select
          id="fmCat"
          bind:value={category}
          onchange={(e) => { if (e.target.value === '__new__') { addingCat = true; category = 'other'; } }}
        >
          {#each allCats as c (c)}
            <option value={c}>{catDisplay(c)}</option>
          {/each}
          <option value="__new__">+ Add new category...</option>
        </select>
        {#if addingCat}
          <div style="margin-top:6px;display:flex;gap:6px;">
            <input type="text" bind:value={newCatName} placeholder="e.g. Medical" style="flex:1;font-size:11px;padding:4px 8px;" onkeydown={(e) => e.key === 'Enter' && confirmNewCat()} />
            <button type="button" class="act" onclick={confirmNewCat} style="font-size:10px;padding:3px 8px;">Add</button>
            <button type="button" onclick={() => { addingCat = false; newCatName = ''; }} style="font-size:10px;padding:3px 8px;">✕</button>
          </div>
        {/if}
      </div>
      <div>
        <label for="fmGroup">Group (opt)</label>
        <input id="fmGroup" bind:value={group} placeholder="e.g. boeing, diraq" onkeydown={onEnter} />
      </div>
      <div style="display:flex;align-items:flex-end;padding-bottom:4px;">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;color:var(--t1);">
          <input type="checkbox" bind:checked={enabled} /> Enabled
        </label>
      </div>
    </div>

    <div class="mf">
      <button onclick={closeFlowModal}>Cancel</button>
      <button class="pri" onclick={save}>{editing ? 'Save' : 'Add'}</button>
    </div>
  </div>
</div>
