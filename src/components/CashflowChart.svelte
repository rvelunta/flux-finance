<script>
  import { onDestroy } from 'svelte';

  let { transfers, checkingId } = $props();

  let canvas;
  let chart = null;

  $effect(() => {
    if (!canvas || !transfers || !checkingId) return;
    if (chart) chart.destroy();

    const byMo = {};
    transfers.forEach((t) => {
      const mk = t.date.getFullYear() + '-' + String(t.date.getMonth() + 1).padStart(2, '0');
      if (!byMo[mk]) byMo[mk] = { inf: 0, out: 0 };
      if (t.to === checkingId) byMo[mk].inf += t.amount;
      if (t.from === checkingId) byMo[mk].out += t.amount;
    });
    const moKeys = Object.keys(byMo).sort();

    chart = new window.Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: moKeys.map((k) => {
          const [y, m] = k.split('-');
          return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short' });
        }),
        datasets: [
          {
            label: 'Inflow',
            data: moKeys.map((k) => byMo[k].inf),
            backgroundColor: '#2dd4a830',
            borderColor: '#2dd4a8',
            borderWidth: 1,
            borderRadius: 3,
          },
          {
            label: 'Outflow',
            data: moKeys.map((k) => -byMo[k].out),
            backgroundColor: '#ef646130',
            borderColor: '#ef6461',
            borderWidth: 1,
            borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#6a7490',
              font: { family: "'IBM Plex Mono'", size: 9 },
              padding: 10,
              usePointStyle: true,
            },
          },
          tooltip: {
            backgroundColor: '#161922',
            borderColor: '#2a3040',
            borderWidth: 1,
            titleFont: { family: "'IBM Plex Mono'", size: 10 },
            bodyFont: { family: "'IBM Plex Mono'", size: 10 },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#4a5268', font: { family: "'IBM Plex Mono'", size: 9 } },
          },
          y: {
            grid: { color: 'rgba(42,48,64,0.4)', drawBorder: false },
            ticks: {
              color: '#4a5268',
              font: { family: "'IBM Plex Mono'", size: 9 },
              callback: (v) => '$' + (Math.abs(v) >= 1000 ? (v / 1000).toFixed(0) + 'k' : v),
            },
          },
        },
      },
    });
  });

  onDestroy(() => { if (chart) chart.destroy(); });
</script>

<canvas bind:this={canvas}></canvas>
