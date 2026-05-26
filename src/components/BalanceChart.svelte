<script>
  import { onDestroy } from 'svelte';
  import { fmtShort } from '../lib/format.js';

  let {
    snapshots,
    primaryLine,
    selectedAcctIds = new Set(),
    projMonths,
    resolution = 'monthly',
    transfers = [],
    compareLines = [],
  } = $props();

  let canvas;
  let chart = null;

  $effect(() => {
    if (!canvas || !snapshots?.length || !primaryLine) return;
    if (chart) chart.destroy();

    const labels = snapshots.map((s) => {
      if (resolution === 'daily') {
        return projMonths > 3
          ? s.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : s.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      }
      if (resolution === 'weekly') {
        return s.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
      return projMonths > 120
        ? s.date.getFullYear().toString()
        : s.date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    });

    const inflows = new Array(snapshots.length).fill(0);
    const outflows = new Array(snapshots.length).fill(0);
    if (selectedAcctIds.size > 0 && transfers.length > 0) {
      let snapIdx = 0;
      for (const t of transfers) {
        while (snapIdx < snapshots.length - 1 && snapshots[snapIdx].date < t.date) snapIdx++;
        if (snapshots[snapIdx].date < t.date) continue;
        const fromSel = selectedAcctIds.has(t.from);
        const toSel = selectedAcctIds.has(t.to);
        if (toSel && !fromSel) inflows[snapIdx] += t.amount;
        else if (fromSel && !toSel) outflows[snapIdx] += t.amount;
      }
    }
    const maxFlow = Math.max(...inflows, ...outflows);
    const hasCashflow = maxFlow > 0;

    const datasets = [
      {
        label: primaryLine.name,
        data: primaryLine.data,
        borderColor: primaryLine.color,
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
        yAxisID: 'y',
        order: 0,
      },
    ];

    compareLines.forEach((cl) => {
      datasets.push({
        label: cl.name,
        data: cl.data,
        borderColor: cl.color,
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 1.5,
        borderDash: cl.dash,
        yAxisID: 'y',
        order: 0,
      });
    });

    if (hasCashflow) {
      datasets.push({
        type: 'bar',
        label: 'Inflow',
        data: inflows,
        backgroundColor: '#2dd4a822',
        borderColor: '#2dd4a866',
        borderWidth: 1,
        borderRadius: 2,
        yAxisID: 'y1',
        order: 2,
      });
      datasets.push({
        type: 'bar',
        label: 'Outflow',
        data: outflows.map((v) => -v),
        backgroundColor: '#ef646122',
        borderColor: '#ef646166',
        borderWidth: 1,
        borderRadius: 2,
        yAxisID: 'y1',
        order: 2,
      });
    }

    const scales = {
      x: {
        grid: { color: 'rgba(42,48,64,0.4)', drawBorder: false },
        ticks: { color: '#4a5268', font: { family: "'IBM Plex Mono'", size: 9 }, maxTicksLimit: 10 },
      },
      y: {
        position: 'left',
        grid: { color: 'rgba(42,48,64,0.4)', drawBorder: false },
        ticks: {
          color: '#4a5268',
          font: { family: "'IBM Plex Mono'", size: 9 },
          callback: (v) => fmtShort(v),
        },
      },
    };

    if (hasCashflow) {
      const span = maxFlow * 2.2;
      scales.y1 = {
        type: 'linear',
        position: 'right',
        min: -span,
        max: span,
        grid: { drawOnChartArea: false, color: 'rgba(42,48,64,0.4)' },
        ticks: {
          color: '#4a5268',
          font: { family: "'IBM Plex Mono'", size: 9 },
          callback: (v) => fmtShort(v),
        },
      };
    }

    chart = new window.Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
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
            padding: 8,
            callbacks: {
              label: (item) => {
                const v = item.dataset.label === 'Outflow' ? Math.abs(item.raw) : item.raw;
                return `${item.dataset.label}: $${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
              },
            },
          },
        },
        scales,
      },
    });
  });

  onDestroy(() => { if (chart) chart.destroy(); });
</script>

<canvas bind:this={canvas}></canvas>
