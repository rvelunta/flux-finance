<script>
  import { onMount, onDestroy } from 'svelte';
  import { store } from '../lib/state.svelte.js';
  import { ACCT_COLORS, CAT_COLORS } from '../lib/constants.js';
  import { toMonthlyAmt } from '../lib/format.js';
  import { cssVar } from '../lib/theme.svelte.js';

  let canvas;
  let tooltip;
  let showMode = $state('all');
  let showLabels = $state(true);
  let ctrlOpen = $state(false);

  let graphNodes = [];
  let graphEdges = [];
  let graphAnim = null;
  let graphDrag = null;
  let graphInited = false;
  let currentDpr = 1;
  let currentScale = 1;
  let graphLayout = null;

  const LAYER_LABELS = ['Deductions', 'Income', 'Accounts', 'Expenses'];
  const LAYER_LABEL_COLORS = ['#ef6461', '#2dd4a8', '#5b9cf6', '#f0b952'];

  function getLayer(acct) {
    if (!acct.external) return 2;
    if (acct.type === 'income-source') return 1;
    if (acct.type === 'tax') return 0;
    if (acct.type === 'expense' && acct.name.toLowerCase().includes('benefit')) return 0;
    return 3;
  }

  // Vertical layered layout: each non-empty layer becomes a horizontal band,
  // stacked top → bottom, so the user scrolls down through the layers. Nodes are
  // arranged in a centered grid within their band; the canvas grows as tall as
  // needed and the wrap scrolls. Returns node positions, per-band metrics (for
  // labels + Y clamping), and the total canvas height.
  function buildVerticalLayout(nodes, W, rInt, sc) {
    const layers = [[], [], [], []];
    nodes.forEach((n) => { layers[n.layer].push(n); });
    const padX = W * 0.06;
    const usableW = W - padX * 2;
    const labelH = 26 * sc;             // header strip for the layer label
    const padV = 76 * sc;              // gap below each band's grid
    const cellW = rInt * 2 + 52 * sc;   // horizontal slot → ~3 nodes per row on phones
    const cellH = rInt * 2 + 150 * sc;  // tall row → generous vertical spacing
    const positions = {};
    const bands = [];
    let y = 28 * sc;
    layers.forEach((layer, li) => {
      if (!layer.length) return;
      const perRow = Math.max(1, Math.floor(usableW / cellW));
      const rows = Math.ceil(layer.length / perRow);
      const top = y;
      const gridTop = top + labelH;
      const gridH = rows * cellH;
      layer.forEach((n, ni) => {
        const row = Math.floor(ni / perRow);
        const col = ni % perRow;
        const inRow = Math.min(perRow, layer.length - row * perRow);
        const slotW = usableW / inRow;
        positions[n.id] = {
          x: padX + slotW * (col + 0.5),
          y: gridTop + cellH * (row + 0.5),
        };
      });
      const bottom = gridTop + gridH + padV;
      bands.push({ layer: li, top, bottom, labelY: top + 14 * sc, nodeTop: gridTop, nodeBottom: gridTop + gridH });
      y = bottom;
    });
    return { positions, bands, totalH: y + 28 * sc };
  }

  function initGraph(forceReset = false) {
    setTimeout(() => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth;
      if (cssW < 50) return;
      currentDpr = dpr;
      const W = cssW * dpr;
      // Scale folds in dpr so node/font sizes are legible in real (CSS) terms on
      // high-density screens, with a gentle shrink on very narrow viewports.
      // Everything below is in backing px; apparent CSS size ≈ value / dpr.
      currentScale = dpr * Math.max(0.82, Math.min(1, cssW / 430));
      const sc = currentScale;
      // One uniform node radius — external nodes are distinguished by their
      // dashed border, not by size.
      const rNode = 34 * sc;

      const showEnabled = showMode === 'enabled';
      const activeFlows = store.flows.filter((f) => showEnabled ? f.enabled : true);

      const referencedIds = new Set();
      activeFlows.forEach((f) => { referencedIds.add(f.from); referencedIds.add(f.to); });
      const nodeList = store.accounts
        .filter((a) => !a.external || referencedIds.has(a.id))
        .map((a) => ({ id: a.id, label: a.name, type: a.type, balance: a.balance, external: !!a.external, layer: getLayer(a) }));

      const layout = buildVerticalLayout(nodeList, W, rNode, sc);
      graphLayout = layout;
      const totalH = layout.totalH;

      // Backing store is W × totalH; the element is displayed at CSS width 100%
      // and an explicit tall height so the wrap scrolls vertically through it.
      canvas.width = W;
      canvas.height = totalH;
      canvas.style.height = (totalH / dpr) + 'px';

      const bandByLayer = {};
      layout.bands.forEach((b) => { bandByLayer[b.layer] = b; });

      graphNodes = nodeList.map((n) => {
        const existing = (!forceReset && graphInited) ? graphNodes.find((gn) => gn.id === n.id) : null;
        const p = layout.positions[n.id] || { x: W / 2, y: totalH / 2 };
        const band = bandByLayer[n.layer];
        return {
          ...n,
          x: existing ? existing.x : p.x,
          y: existing ? existing.y : p.y,
          vx: 0, vy: 0,
          r: rNode,
          bandTop: band ? band.nodeTop : 0,
          bandBottom: band ? band.nodeBottom : totalH,
        };
      });

      const edgeMap = {};
      activeFlows.forEach((f) => {
        if (!layout.positions[f.from] || !layout.positions[f.to]) return;
        const k = f.from + '|' + f.to;
        const amt = toMonthlyAmt(f);
        if (!edgeMap[k]) edgeMap[k] = { from: f.from, to: f.to, amount: 0, category: f.category, flows: [] };
        edgeMap[k].amount += amt;
        edgeMap[k].flows.push(f);
      });
      graphEdges = Object.values(edgeMap);
      const maxAmt = Math.max(...graphEdges.map((e) => e.amount), 1);
      graphEdges.forEach((e) => { e.width = Math.max(1.5, Math.min(10, (e.amount / maxAmt) * 10)); });

      graphInited = true;
      if (graphAnim) cancelAnimationFrame(graphAnim);
      runGraphSim();
    }, 50);
  }

  function resetLayout() { graphInited = false; initGraph(true); }

  function runGraphSim() {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    let steps = 0;

    function tick() {
      const alpha = Math.max(0.001, 0.15 * Math.pow(0.995, steps));
      steps++;

      for (let i = 0; i < graphNodes.length; i++) {
        for (let j = i + 1; j < graphNodes.length; j++) {
          const a = graphNodes[i], b = graphNodes[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = (a.r + b.r) * 2.5;
          if (dist < minDist) {
            const force = (minDist - dist) * 0.3 * alpha;
            const fx = dx / dist * force;
            const fy = dy / dist * force;
            a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
          }
        }
      }

      graphEdges.forEach((e) => {
        const a = graphNodes.find((n) => n.id === e.from);
        const b = graphNodes.find((n) => n.id === e.to);
        if (!a || !b) return;
        let dx = b.x - a.x, dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist > 300) {
          const force = (dist - 300) * 0.001 * alpha;
          const fx = dx / dist * force;
          const fy = dy / dist * force;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        }
      });

      graphNodes.forEach((n) => {
        if (n === graphDrag) return;
        n.vx *= 0.7; n.vy *= 0.7;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(n.r + 10, Math.min(W - n.r - 10, n.x));
        // Keep each node inside its layer's vertical band so the layers stay
        // visually separated as the user scrolls.
        n.y = Math.max(n.bandTop + n.r, Math.min(n.bandBottom - n.r, n.y));
      });

      drawGraph(ctx, W, H);
      graphAnim = requestAnimationFrame(tick);
    }
    tick();
  }

  function drawGraph(ctx, W, H) {
    ctx.clearRect(0, 0, W, H);
    // Theme-aware structural colors (re-read each frame so toggling is live).
    const cNodeFill = cssVar('--s1');
    const cLabel = cssVar('--t2');
    const cLabelExt = cssVar('--t4');
    const cFallback = cssVar('--t3');
    const cEquity = cssVar('--pur');
    const nodeMap = {};
    graphNodes.forEach((n) => { nodeMap[n.id] = n; });

    const sc = currentScale;
    // Layer bands: a faint divider above each band and a left-aligned label.
    if (graphLayout) {
      graphLayout.bands.forEach((band, bi) => {
        if (bi > 0) {
          ctx.beginPath();
          ctx.moveTo(0, band.top);
          ctx.lineTo(W, band.top);
          ctx.strokeStyle = cFallback;
          ctx.globalAlpha = 0.14;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.font = `600 ${Math.round(14 * sc)}px "IBM Plex Mono"`;
        ctx.fillStyle = LAYER_LABEL_COLORS[band.layer];
        ctx.globalAlpha = 0.55;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(LAYER_LABELS[band.layer].toUpperCase(), W * 0.05, band.labelY);
        ctx.globalAlpha = 1;
      });
    }

    store.accounts.filter((a) => a.linkedTo).forEach((debt) => {
      const dNode = nodeMap[debt.id];
      const aNode = nodeMap[debt.linkedTo];
      if (!dNode || !aNode) return;
      ctx.beginPath();
      ctx.setLineDash([8, 6]);
      ctx.moveTo(dNode.x, dNode.y);
      ctx.lineTo(aNode.x, aNode.y);
      ctx.strokeStyle = cEquity;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.2;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      const mx = (dNode.x + aNode.x) / 2;
      const my = (dNode.y + aNode.y) / 2;
      const dBal = debt.balance;
      const aBal = store.accounts.find((a) => a.id === debt.linkedTo)?.balance || 0;
      const equity = aBal + dBal;
      ctx.font = `500 ${Math.round(13 * sc)}px "IBM Plex Mono"`;
      ctx.fillStyle = cEquity;
      ctx.globalAlpha = 0.5;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(
        'equity ' + (equity >= 0 ? '+' : '') + (Math.abs(equity) >= 1000 ? '$' + (equity / 1000).toFixed(0) + 'k' : '$' + Math.round(equity)),
        mx, my - 4
      );
      ctx.globalAlpha = 1;
    });

    graphEdges.forEach((e) => {
      const a = nodeMap[e.from];
      const b = nodeMap[e.to];
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = dx / dist, ny = dy / dist;
      const x1 = a.x + nx * a.r, y1 = a.y + ny * a.r;
      const x2 = b.x - nx * b.r, y2 = b.y - ny * b.r;
      const col = CAT_COLORS[e.category] || cFallback;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const cpOff = Math.max(30, dist * 0.2);
      const perpX = -(y2 - y1) / dist * cpOff * 0.15;
      const perpY = (x2 - x1) / dist * cpOff * 0.15;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(mx + perpX, my + perpY, x2, y2);
      ctx.strokeStyle = col;
      ctx.lineWidth = e.width * 2;
      ctx.globalAlpha = 0.3;
      ctx.stroke();
      ctx.globalAlpha = 1;

      const angle = Math.atan2(y2 - (my + perpY), x2 - (mx + perpX));
      const hl = 12 + e.width;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - hl * Math.cos(angle - 0.35), y2 - hl * Math.sin(angle - 0.35));
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - hl * Math.cos(angle + 0.35), y2 - hl * Math.sin(angle + 0.35));
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(2, e.width);
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (showLabels && e.amount > 0) {
        ctx.font = `500 ${Math.round(13 * sc)}px "IBM Plex Mono"`;
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.65;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('$' + Math.round(e.amount).toLocaleString(), mx + perpX, my + perpY - 6);
        ctx.globalAlpha = 1;
      }
    });

    graphNodes.forEach((n) => {
      const col = ACCT_COLORS[n.type] || cFallback;
      const isExt = n.external;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + 5, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.globalAlpha = isExt ? 0.03 : 0.06;
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = cNodeFill;
      ctx.fill();
      ctx.lineWidth = isExt ? 1.5 : 2.5;
      ctx.strokeStyle = col;
      if (isExt) { ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]); }
      else ctx.stroke();

      const bal = isExt
        ? (store.simData ? store.simData.finalBalances[n.id] || 0 : 0)
        : n.balance;
      if (bal !== 0 || !isExt) {
        ctx.font = `600 ${Math.round((isExt ? 12 : 14) * sc)}px "IBM Plex Mono"`;
        ctx.fillStyle = col;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const short = Math.abs(bal) >= 1000
          ? '$' + (Math.abs(bal) / 1000).toFixed(0) + 'k'
          : '$' + Math.round(Math.abs(bal));
        ctx.fillText(short, n.x, n.y);
      }

      ctx.font = `500 ${Math.round((isExt ? 12 : 14) * sc)}px "IBM Plex Mono"`;
      ctx.fillStyle = isExt ? cLabelExt : cLabel;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const label = n.label.length > 14 ? n.label.slice(0, 13) + '…' : n.label;
      ctx.fillText(label, n.x, n.y + n.r + 8);
    });
  }

  let dragging = null;
  let hovered = null;

  function getPos(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return { x: (clientX - r.left) * currentDpr, y: (clientY - r.top) * currentDpr };
  }

  function hitNode(pos) {
    return graphNodes.find((n) => Math.hypot(n.x - pos.x, n.y - pos.y) < n.r + 8);
  }

  function showTooltip(node, clientX, clientY) {
    const incoming = graphEdges.filter((ed) => ed.to === node.id);
    const outgoing = graphEdges.filter((ed) => ed.from === node.id);
    const bal = node.external
      ? (store.simData ? store.simData.finalBalances[node.id] || 0 : 0)
      : node.balance;
    let html = `<div style="font-weight:600;margin-bottom:4px;color:${ACCT_COLORS[node.type] || 'var(--t2)'}">${node.label}</div>`;
    if (!node.external) html += `<div style="color:var(--t2)">Balance: <span style="color:var(--grn)">$${(bal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>`;
    else if (bal !== 0) html += `<div style="color:var(--t2)">Cumulative: <span style="color:${bal > 0 ? 'var(--grn)' : 'var(--red)'}">$${Math.abs(bal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>`;
    if (incoming.length) html += `<div style="margin-top:4px;color:var(--t3)">In: ${incoming.map((ed) => '$' + Math.round(ed.amount).toLocaleString() + '/mo').join(', ')}</div>`;
    if (outgoing.length) html += `<div style="color:var(--t3)">Out: ${outgoing.map((ed) => '$' + Math.round(ed.amount).toLocaleString() + '/mo').join(', ')}</div>`;
    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    // Keep tooltip on screen — flip to the left/above edge if needed.
    const vw = window.innerWidth, vh = window.innerHeight;
    const tw = 260, th = tooltip.offsetHeight || 80;
    const left = clientX + tw + 28 > vw ? Math.max(8, clientX - tw - 14) : clientX + 14;
    const top = clientY + th + 28 > vh ? Math.max(8, clientY - th - 14) : clientY + 14;
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  function onPointerDown(clientX, clientY) {
    const pos = getPos(clientX, clientY);
    const node = hitNode(pos);
    if (node) {
      dragging = node;
      graphDrag = node;
      canvas.style.cursor = 'grabbing';
      showTooltip(node, clientX, clientY);
    }
  }

  function onPointerMove(clientX, clientY) {
    const pos = getPos(clientX, clientY);
    if (dragging) {
      dragging.x = Math.max(dragging.r + 10, Math.min(canvas.width - dragging.r - 10, pos.x));
      dragging.y = Math.max(dragging.bandTop + dragging.r, Math.min(dragging.bandBottom - dragging.r, pos.y));
      dragging.vx = 0; dragging.vy = 0;
      showTooltip(dragging, clientX, clientY);
      return;
    }
    const node = hitNode(pos);
    if (node && node !== hovered) {
      hovered = node;
      canvas.style.cursor = 'pointer';
      showTooltip(node, clientX, clientY);
    } else if (!node) {
      hovered = null;
      canvas.style.cursor = 'grab';
      tooltip.style.display = 'none';
    }
  }

  function onPointerEnd() {
    dragging = null;
    graphDrag = null;
    canvas.style.cursor = 'grab';
    // On touch devices, hide the tooltip on release so it doesn't linger.
    tooltip.style.display = 'none';
    hovered = null;
  }

  function onMouseDown(e) { onPointerDown(e.clientX, e.clientY); }
  function onMouseMove(e) { onPointerMove(e.clientX, e.clientY); }
  function onMouseUp() { onPointerEnd(); }
  function onMouseLeave() { onPointerEnd(); }

  function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    onPointerDown(t.clientX, t.clientY);
    if (dragging) e.preventDefault();
  }
  function onTouchMove(e) {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (dragging) e.preventDefault();
    onPointerMove(t.clientX, t.clientY);
  }
  function onTouchEnd() { onPointerEnd(); }
  function onResize() { initGraph(); }

  onMount(() => {
    initGraph(true);
    window.addEventListener('resize', onResize);
  });

  onDestroy(() => {
    if (graphAnim) cancelAnimationFrame(graphAnim);
    window.removeEventListener('resize', onResize);
  });

  $effect(() => {
    showMode; showLabels; ctrlOpen;
    if (graphInited) initGraph();
  });
</script>

<div class="view active" style="flex-direction:column;overflow:hidden;">
  <div class="ctrl">
    <button onclick={resetLayout}>Reset layout</button>
    <span style="margin-left:auto;display:flex;gap:8px;align-items:center;">
      <button type="button" class="ctrl-toggle" onclick={() => ctrlOpen = !ctrlOpen}>
        <span>Options</span>
        <span class="ctrl-toggle-caret">{ctrlOpen ? '▴' : '▾'}</span>
      </button>
    </span>
  </div>
  <div class="ctrl-body" class:open={ctrlOpen}>
    <label for="graphMode">Show</label>
    <select id="graphMode" bind:value={showMode}>
      <option value="all">All flows</option>
      <option value="enabled">Enabled only</option>
    </select>
    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--t1);">
      <input type="checkbox" bind:checked={showLabels} /> Amounts
    </label>
  </div>
  <div class="graph-canvas-wrap">
    <canvas
      bind:this={canvas}
      class="graph-canvas"
      onmousedown={onMouseDown}
      onmousemove={onMouseMove}
      onmouseup={onMouseUp}
      onmouseleave={onMouseLeave}
      ontouchstart={onTouchStart}
      ontouchmove={onTouchMove}
      ontouchend={onTouchEnd}
      ontouchcancel={onTouchEnd}
    ></canvas>
  </div>
  <div
    bind:this={tooltip}
    style="display:none;position:fixed;background:var(--s2);border:1px solid var(--b2);border-radius:6px;padding:10px 14px;font-family:var(--mono);font-size:11px;pointer-events:none;z-index:10;max-width:260px;"
  ></div>
</div>

<style>
  .graph-canvas-wrap {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
  }
  .graph-canvas {
    display: block;
    width: 100%;
    /* height is set inline (canvas.style.height) to the computed layout height
       so the wrap scrolls vertically through the stacked layers. */
    cursor: grab;
    touch-action: pan-y;
  }
</style>
