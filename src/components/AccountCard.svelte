<script>
  import { store, openAccountModal, openScheduleModal, openFlowModal, deleteAccount } from '../lib/state.svelte.js';
  import { ACCT_COLORS, TYPE_LABELS } from '../lib/constants.js';
  import { fmt2, fmtAbs2 } from '../lib/format.js';
  import Sparkline from './Sparkline.svelte';

  let { account } = $props();

  const isExt = $derived(account.external);
  const simBal = $derived(store.simData?.finalBalances[account.id] ?? null);
  const bal = $derived(simBal !== null ? simBal : (isExt ? 0 : account.balance));
  const balColor = $derived(
    isExt
      ? (bal > 0 ? 'var(--grn)' : bal < 0 ? 'var(--red)' : 'var(--t3)')
      : (account.balance >= 0 ? 'var(--grn)' : 'var(--red)')
  );
  const projLabel = $derived(
    simBal !== null
      ? (isExt ? `Total over period: ${fmtAbs2(bal)}` : `Projected: ${fmt2(bal)}`)
      : 'Run simulation to project'
  );
  const inFlows = $derived(store.flows.filter((f) => f.to === account.id));
  const outFlows = $derived(store.flows.filter((f) => f.from === account.id));
  const nTotal = $derived(inFlows.length + outFlows.length);

  function confirmDelete() {
    const connected = store.flows.filter((f) => f.from === account.id || f.to === account.id);
    let msg = `Delete "${account.name}"?`;
    if (connected.length) msg += `\n\n${connected.length} flow${connected.length !== 1 ? 's' : ''} reference this account and will be orphaned.`;
    if (confirm(msg)) deleteAccount(account.id);
  }
</script>

<div class="acct-card type-{account.type}" style="{isExt ? 'border-style:dashed;opacity:0.85;' : ''}">
  <div class="ac-top">
    <span class="ac-name">
      {account.name}
      {#if account.annualRate}
        <span style="font-size:10px;font-family:var(--mono);color:{account.annualRate > 0 && account.balance < 0 ? 'var(--red)' : account.annualRate > 0 ? 'var(--grn)' : 'var(--t3)'};margin-left:6px;">
          {(account.annualRate * 100).toFixed(2)}% APR
        </span>
      {/if}
    </span>
    <span class="ac-type">{TYPE_LABELS[account.type] || account.type}{isExt ? ' · ext' : ''}</span>
  </div>
  <div class="ac-bal" style="color:{balColor}">
    {isExt ? '$0.00' : '$' + account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
  </div>
  <div class="ac-proj">{projLabel}</div>

  {#if nTotal > 0}
    <details style="margin-top:8px;">
      <summary style="font-family:var(--mono);font-size:10px;color:var(--t3);cursor:pointer;user-select:none;list-style:none;display:flex;align-items:center;gap:4px;">
        <span class="fl-detail-toggle" style="font-size:8px;color:var(--t4);transition:transform 0.15s;display:inline-block;">▶</span>
        {nTotal} flow{nTotal !== 1 ? 's' : ''}
      </summary>
      <div style="margin-top:4px;font-family:var(--mono);font-size:10px;border-top:1px solid var(--b1);padding-top:4px;">
        {#each inFlows as f (f.id)}
          <div
            role="button" tabindex="0"
            onclick={() => openFlowModal(f.id)}
            onkeydown={(e) => e.key === 'Enter' && openFlowModal(f.id)}
            style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;cursor:pointer;border-radius:3px;"
          >
            <span style="color:var(--t2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">{f.name}</span>
            <span style="color:var(--grn);flex-shrink:0;margin-left:8px;">+{fmt2(f.amount)}</span>
          </div>
        {/each}
        {#each outFlows as f (f.id)}
          <div
            role="button" tabindex="0"
            onclick={() => openFlowModal(f.id)}
            onkeydown={(e) => e.key === 'Enter' && openFlowModal(f.id)}
            style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;cursor:pointer;border-radius:3px;"
          >
            <span style="color:var(--t2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">{f.name}</span>
            <span style="color:var(--red);flex-shrink:0;margin-left:8px;">-{fmt2(f.amount)}</span>
          </div>
        {/each}
      </div>
    </details>
  {/if}

  <div class="ac-chart">
    {#if store.simData}
      <Sparkline snapshots={store.simData.monthlySnapshots} acctId={account.id} type={account.type} />
    {/if}
  </div>

  <div class="ac-actions">
    <button onclick={() => openAccountModal(account.id)}>Edit</button>
    {#if account.annualRate && !isExt && store.simData}
      <button onclick={() => openScheduleModal(account.id)}>Schedule</button>
    {/if}
    <button class="del" onclick={confirmDelete}>Delete</button>
  </div>
</div>
