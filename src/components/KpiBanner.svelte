<script>
  import { store } from '../lib/state.svelte.js';
  import { fmt0, fmt2 } from '../lib/format.js';
  import { parseDate, daysBetween } from '../lib/dates.js';

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
</script>

<div class="ctrl">
  <span style="font-family:var(--mono);font-size:10px;color:var(--t3);">
    Projection {store.config.startDate} → {store.config.endDate} · ≈ {projMonths} mo
  </span>
  {#if store.activeView !== 'projection'}
    <span style="margin-left:auto;font-family:var(--mono);font-size:10px;color:var(--t4);">
      Set range on the Projection tab
    </span>
  {/if}
</div>

{#if kpis}
  <div class="kpis">
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
