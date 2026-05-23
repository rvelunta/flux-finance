<script>
  import { onDestroy } from 'svelte';

  let { transfers, checkingId, resolution = 'month' } = $props();

  let canvas;
  let chart = null;

  function bucketKey(date, res) {
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();
    if (res === 'day') return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (res === 'week') {
      // Monday-start week
      const day = (date.getDay() + 6) % 7;
      const monday = new Date(y, m, d - day);
      return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    }
    if (res === 'quarter') return `${y}-Q${Math.floor(m / 3) + 1}`;
    if (res === 'year') return `${y}`;
    return `${y}-${String(m + 1).padStart(2, '0')}`;
  }

  function bucketLabel(key, res) {
    if (res === 'day' || res === 'week') {
      const [y, m, d] = key.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    if (res === 'quarter') {
      const [y, q] = key.split('-');
      return `${q} '${y.slice(2)}`;
    }
    if (res === 'year') return key;
    const [y, m] = key.split('-');
    return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short' });
  }

  $effect(() => {
    if (!canvas || !transfers || !checkingId) return;
    if (chart) chart.destroy();

    const byKey = {};
    transfers.forEach((t) => {
      const k = bucketKey(t.date, resolution);
      if (!byKey[k]) byKey[k] = { inf: 0, out: 0 };
      if (t.to === checkingId) byKey[k].inf += t.amount;
      if (t.from === checkingId) byKey[k].out += t.amount;
    });
    const keys = Object.keys(byKey).sort();

    chart = new window.Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: keys.map((k) => bucketLabel(k, resolution)),
        datasets: [
          {
            label: 'Inflow',
            data: keys.map((k) => byKey[k].inf),
            backgroundColor: '#2dd4a830',
            borderColor: '#2dd4a8',
            borderWidth: 1,
            borderRadius: 3,
          },
          {
            label: 'Outflow',
            data: keys.map((k) => -byKey[k].out),
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
            ticks: {
              color: '#4a5268',
              font: { family: "'IBM Plex Mono'", size: 9 },
              maxTicksLimit: 12,
              autoSkip: true,
            },
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
