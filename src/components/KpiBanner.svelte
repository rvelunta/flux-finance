<script>
  import { store } from '../lib/state.svelte.js';
  import { fmt0, fmt2 } from '../lib/format.js';
  import { parseDate, daysBetween } from '../lib/dates.js';
  import { isMobile } from '../lib/platform.js';

  // On mobile the banner doubles as the header, so it hosts the ☰ menu button.
  let { onOpenSettings } = $props();

  const projMonths = $derived.by(() => {
    const s = parseDate(store.config.startDate);
    const e = parseDate(store.config.endDate);
    if (!s || !e) return 1;
    return Math.max(1, Math.round(daysBetween(s, e) / 30.44));
  });

  const internalAccts = $derived(store.accounts.filter((a) => !a.external));
  const chkId = $derived(store.accounts.find((a) => a.type === 'checking' && !a.external)?.id);

  const kpis = $derived.by(() => {
    if (!store.simData) return null;
    const sim = store.simData;
    const finalNW = internalAccts.reduce((s, a) => s + (sim.finalBalances[a.id] || 0), 0);
    const startNW = internalAccts.reduce((s, a) => s + a.balance, 0);
    const nwDelta = finalNW - startNW;
    let tIn = 0, tOut = 0;
    if (chkId) sim.allTransfers.forEach((t) => {
      if (t.to === chkId) tIn += t.amount;
      if (t.from === chkId) tOut += t.amount;
    });
    return { finalNW, nwDelta, months: projMonths, mIn: tIn / projMonths, mOut: tOut / projMonths };
  });

  const minBalColor = $derived(
    store.simData
      ? (store.simData.minBal < 0 ? 'var(--red)' : store.simData.minBal < 2000 ? 'var(--amb)' : 'var(--t1)')
      : 'var(--t1)'
  );
  const netColor = $derived(kpis && kpis.mIn - kpis.mOut >= 0 ? 'var(--grn)' : 'var(--red)');
  const net = $derived(kpis ? kpis.mIn - kpis.mOut : 0);
</script>

{#if isMobile}
  <div class="kpi-hero">
    <div class="kh-top">
      <span class="kh-label">Net worth</span>
      <button type="button" class="kpi-burger" onclick={onOpenSettings} aria-label="Menu and settings">☰</button>
    </div>
    {#if kpis}
      <div class="kh-value">{fmt2(kpis.finalNW)}</div>
      <div class="kh-delta" style="color:{kpis.nwDelta >= 0 ? 'var(--grn)' : 'var(--red)'}">
        {kpis.nwDelta >= 0 ? '↑' : '↓'} {kpis.nwDelta >= 0 ? '+' : '−'}{fmt0(Math.abs(kpis.nwDelta))} · {kpis.months}mo
      </div>
      <div class="kh-sub">
        <div class="kh-sub-item">
          <span class="kh-sub-l">Min balance</span>
          <span class="kh-sub-v" style="color:{minBalColor}">{fmt2(store.simData.minBal)}</span>
        </div>
        <div class="kh-sub-item">
          <span class="kh-sub-l">Net / mo</span>
          <span class="kh-sub-v" style="color:{netColor}">{net >= 0 ? '+' : '−'}{fmt0(Math.abs(net))}</span>
        </div>
      </div>
    {/if}
  </div>
{:else}
  <div class="kpi-strip">
    <div class="kc range" title="Set on the Projection tab">
      <span class="kc-l">Range</span>
      <span class="kc-v dim">{store.config.startDate} → {store.config.endDate} · {projMonths}mo</span>
    </div>
    {#if kpis}
      <div class="kc" title="Δ {kpis.nwDelta >= 0 ? '+' : ''}{fmt0(kpis.nwDelta)} over {kpis.months}mo">
        <span class="kc-l">NW</span>
        <span class="kc-v" style="color:var(--grn)">{fmt2(kpis.finalNW)}</span>
      </div>
      <div class="kc" title="on {store.simData.minBalDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}">
        <span class="kc-l">Min</span>
        <span class="kc-v" style="color:{minBalColor}">{fmt2(store.simData.minBal)}</span>
      </div>
      <div class="kc" title="to checking, monthly avg">
        <span class="kc-l">In</span>
        <span class="kc-v" style="color:var(--grn)">{fmt0(kpis.mIn)}</span>
      </div>
      <div class="kc" title="from checking, monthly avg">
        <span class="kc-l">Out</span>
        <span class="kc-v" style="color:var(--red)">{fmt0(kpis.mOut)}</span>
      </div>
      <div class="kc" title="savings rate {kpis.mIn > 0 ? ((kpis.mIn - kpis.mOut) / kpis.mIn * 100).toFixed(0) : 0}%">
        <span class="kc-l">Net</span>
        <span class="kc-v" style="color:{netColor}">{net >= 0 ? '+' : '-'}{fmt0(Math.abs(net))}</span>
      </div>
    {/if}
  </div>
{/if}
