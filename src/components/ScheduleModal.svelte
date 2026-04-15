<script>
  import { store, ui, closeScheduleModal } from '../lib/state.svelte.js';
  import { fmtAbs2, toMonthlyAmt } from '../lib/format.js';

  const acctId = $derived(ui.scheduleModal?.acctId);
  const account = $derived(store.accounts.find((a) => a.id === acctId));

  const data = $derived.by(() => {
    if (!account || !account.annualRate || !store.simData) return null;
    const isDebt = account.balance < 0;
    const monthlyRate = account.annualRate / 12;
    const inflows = store.flows.filter((f) => f.enabled && f.to === acctId);
    const outflows = store.flows.filter((f) => f.enabled && f.from === acctId);
    const monthlyIn = inflows.reduce((s, f) => s + toMonthlyAmt(f), 0);
    const monthlyOut = outflows.reduce((s, f) => s + toMonthlyAmt(f), 0);

    const snaps = store.simData.monthlySnapshots;
    let totalInterest = 0;
    let prevBal = account.balance;
    const rows = snaps.map((snap) => {
      const bal = snap.balances[acctId] || 0;
      const change = bal - prevBal;
      const interest = prevBal * monthlyRate;
      const principal = change - interest;
      totalInterest += Math.abs(interest);
      const mo = snap.date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const r = { mo, bal, interest, principal, change };
      prevBal = bal;
      return r;
    });

    const finalBal = snaps.length ? (snaps[snaps.length - 1].balances[acctId] || 0) : account.balance;

    const summary = [
      `Rate: ${(account.annualRate * 100).toFixed(2)}%`,
      `Start: ${fmtAbs2(account.balance)}`,
      `End: ${fmtAbs2(finalBal)}`,
      `Total ${isDebt ? 'interest paid' : 'growth'}: ${fmtAbs2(totalInterest)}`,
    ];
    if (monthlyIn > 0) summary.push(`Payments in: ${fmtAbs2(monthlyIn)}/mo`);
    if (monthlyOut > 0) summary.push(`Flows out: ${fmtAbs2(monthlyOut)}/mo`);

    return { isDebt, rows, summary };
  });

  const fc = (v) => (v >= 0 ? '' : '-') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function onBackdrop(e) { if (e.target === e.currentTarget) closeScheduleModal(); }
</script>

<div class="modal-overlay" role="presentation" onclick={onBackdrop}>
  <div class="modal" style="width:640px;" role="dialog">
    <h3>{account?.name} — Schedule</h3>
    {#if data}
      <div style="font-family:var(--mono);font-size:11px;color:var(--t2);margin-bottom:12px;">
        {data.summary.join(' · ')}
      </div>
      <div style="max-height:400px;overflow-y:auto;">
        <table class="sched-tbl">
          <thead>
            <tr>
              <th>Month</th>
              <th>{data.isDebt ? 'Interest accrued' : 'Growth'}</th>
              <th>{data.isDebt ? 'Principal paid' : 'Contributions'}</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {#each data.rows as r}
              <tr>
                <td>{r.mo}</td>
                {#if data.isDebt}
                  <td><span style="color:var(--red)">{fc(r.interest)}</span></td>
                  <td><span style="color:var(--grn)">{fc(-r.principal)}</span></td>
                {:else}
                  <td><span style="color:var(--grn)">{fc(r.interest)}</span></td>
                  <td>{fc(r.change - r.interest)}</td>
                {/if}
                <td>{fc(r.bal)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
    <div class="mf">
      <button onclick={closeScheduleModal}>Close</button>
    </div>
  </div>
</div>
