<script>
  import { store, ui, closeAccountModal, addAccount, updateAccount } from '../lib/state.svelte.js';

  const editing = $derived(ui.accountModal?.id ? store.accounts.find((a) => a.id === ui.accountModal.id) : null);

  let name = $state('');
  let type = $state('checking');
  let balance = $state('');
  let asOf = $state('');
  let rate = $state('');
  let external = $state(false);
  let zeroCap = $state(false);
  let linkedTo = $state('');

  let initialized = false;
  $effect(() => {
    if (!ui.accountModal || initialized) return;
    initialized = true;
    if (editing) {
      name = editing.name;
      type = editing.type;
      balance = editing.balance;
      asOf = editing.asOf;
      rate = ((editing.annualRate || 0) * 100) || '';
      external = !!editing.external;
      zeroCap = !!editing.zeroCap;
      linkedTo = editing.linkedTo || '';
    } else {
      name = '';
      type = 'checking';
      balance = '';
      asOf = store.config.startDate;
      rate = '';
      external = false;
      zeroCap = false;
      linkedTo = '';
    }
  });

  function save() {
    if (!name.trim()) return;
    const patch = {
      name: name.trim(),
      type,
      balance: parseFloat(balance) || 0,
      asOf,
      annualRate: (parseFloat(rate) || 0) / 100,
      external,
      zeroCap,
      linkedTo: linkedTo || null,
    };
    if (editing) updateAccount(editing.id, patch);
    else addAccount(patch);
    closeAccountModal();
  }

  function onEnter(e) { if (e.key === 'Enter') save(); }
  function onBackdrop(e) { if (e.target === e.currentTarget) closeAccountModal(); }
</script>

<div class="modal-overlay" role="presentation" onclick={onBackdrop} onkeydown={(e) => e.key === 'Escape' && closeAccountModal()}>
  <div class="modal" role="dialog">
    <h3>{editing ? 'Edit account' : 'Add account'}</h3>

    <div class="fr">
      <div>
        <label for="amName">Name</label>
        <input id="amName" bind:value={name} onkeydown={onEnter} />
      </div>
      <div>
        <label for="amType">Type</label>
        <select id="amType" bind:value={type}>
          <option value="checking">Checking</option>
          <option value="savings">Savings</option>
          <option value="retirement">Retirement</option>
          <option value="hsa">HSA</option>
          <option value="brokerage">Brokerage</option>
          <option value="crypto">Crypto</option>
          <option value="property">Property (Equity)</option>
          <option value="debt">Debt (Liability)</option>
          <option value="income-source">Income Source</option>
          <option value="tax">Tax</option>
          <option value="expense">Expense</option>
        </select>
      </div>
    </div>

    <div class="fr">
      <div>
        <label for="amBal">Starting Balance</label>
        <input id="amBal" type="number" step="0.01" bind:value={balance} onkeydown={onEnter} />
      </div>
      <div>
        <label for="amDate">As of Date</label>
        <input id="amDate" type="date" bind:value={asOf} />
      </div>
    </div>

    <div class="fr">
      <div>
        <label for="amRate">Annual Rate %</label>
        <input id="amRate" type="number" step="0.01" placeholder="0" bind:value={rate} onkeydown={onEnter} />
        <div style="font-size:9px;color:var(--t4);font-family:var(--mono);margin-top:2px;">Growth for assets, APR for debt</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;padding-top:18px;">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;color:var(--t1);margin-bottom:0;">
          <input type="checkbox" bind:checked={external} /> External (tally only)
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;color:var(--t1);margin-bottom:0;">
          <input type="checkbox" bind:checked={zeroCap} /> Cap at zero
        </label>
        <div style="font-size:9px;color:var(--t4);font-family:var(--mono);">Prevents balance from crossing $0</div>
      </div>
    </div>

    <div class="fr">
      <div>
        <label for="amLinked">Linked to (asset for debt)</label>
        <select id="amLinked" bind:value={linkedTo}>
          <option value="">None</option>
          {#each store.accounts.filter((a) => !a.external && a.id !== editing?.id) as a (a.id)}
            <option value={a.id}>{a.name}</option>
          {/each}
        </select>
        <div style="font-size:9px;color:var(--t4);font-family:var(--mono);margin-top:2px;">Links debt to its funded asset</div>
      </div>
      <div></div>
    </div>

    <div class="mf">
      <button onclick={closeAccountModal}>Cancel</button>
      <button class="pri" onclick={save}>{editing ? 'Save' : 'Add'}</button>
    </div>
  </div>
</div>
