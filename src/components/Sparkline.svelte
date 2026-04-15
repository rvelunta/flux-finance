<script>
  import { onDestroy } from 'svelte';
  import { ACCT_COLORS } from '../lib/constants.js';

  let { snapshots, acctId, type } = $props();

  let canvas;
  let chart = null;

  $effect(() => {
    if (!canvas || !snapshots?.length) return;
    if (chart) chart.destroy();
    const col = ACCT_COLORS[type] || '#6a7490';
    chart = new window.Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: snapshots.map(() => ''),
        datasets: [{
          data: snapshots.map((s) => s.balances[acctId] || 0),
          borderColor: col,
          backgroundColor: col + '15',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 1.5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
      },
    });
  });

  onDestroy(() => { if (chart) chart.destroy(); });
</script>

<canvas bind:this={canvas}></canvas>
