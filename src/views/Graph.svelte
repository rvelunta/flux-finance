<script>
  import { onMount, onDestroy } from 'svelte';
  import { store } from '../lib/state.svelte.js';
  import { ACCT_COLORS, CAT_COLORS } from '../lib/constants.js';
  import { toMonthlyAmt } from '../lib/format.js';

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

  const LAYER_LABELS = ['Deductions', 'Income', 'Accounts', 'Expenses'];
  const LAYER_LABEL_COLORS = ['#ef6461', '#2dd4a8', '#5b9cf6', '#f0b952'];

  function getLayer(acct) {
    if (!acct.external) return 2;
    if (acct.type === 'income-source') return 1;
    if (acct.type === 'tax') return 0;
    if (acct.type === 'expense' && acct.name.toLowerCase().includes('benefit')) return 0;
    return 3;
  }

  function buildLayeredPositions(nodes, W, H) {
    const layers = [[], [], [], []];
    nodes.forEach((n) => { layers[n.layer].push(n); });
    const padX = W * 0.08, padY = H * 0.12;
    const usableW = W - padX * 2, usableH = H - padY * 2;
    const colW = usableW / 3;
    const positions = {};
    layers.forEach((layer, li) => {
      if (!layer.length) return;
      const x = padX + li * colW;
      const gap = Math.min(90, usableH / (layer.length + 1));
      const startY = H / 2 - (layer.length - 1) * gap / 2;
      layer.forEach((n, ni) => { positions[n.id] = { x, y: startY + ni * gap }; });
    });
    return positions;
  }

  function initGraph(forceReset = false) {
    setTimeout(() => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (cssW < 50 || cssH < 50) return;
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      currentDpr = dpr;
      // Scale node sizes and fonts based on the smaller canvas dimension so
      // the layout doesn't overlap on narrow viewports.
      currentScale = Math.max(0.45, Math.min(1, Math.min(cssW, cssH) / 600));

      const showEnabled = showMode === 'enabled';
      const activeFlows = store.flows.filter((f) => showEnabled ? f.enabled : true);
      const W = canvas.width, H = canvas.height;

      const referencedIds = new Set();
      activeFlows.forEach((f) => { referencedIds.add(f.from); referencedIds.add(f.to); });
      const nodeList = store.accounts
        .filter((a) => !a.external || referencedIds.has(a.id))
        .map((a) => ({ id: a.id, label: a.name, type: a.type, balance: a.balance, external: !!a.external, layer: getLayer(a) }));

      const preset = buildLayeredPositions(nodeList, W, H);
      const rInt = 40 * currentScale;
      const rExt = 28 * currentScale;

      graphNodes = nodeList.map((n) => {
        const existing = (!forceReset && graphInited) ? graphNodes.find((gn) => gn.id === n.id) : null;
        const p = preset[n.id] || { x: W / 2, y: H / 2 };
        return { ...n, x: existing ? existing.x : p.x, y: existing ? existing.y : p.y, vx: 0, vy: 0, r: n.external ? rExt : rInt };
      });

      const edgeMap = {};
      activeFlows.forEach((f) => {
        if (!preset[f.from] || !preset[f.to]) return;
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
        n.y = Math.max(n.r + 10, Math.min(H - n.r - 10, n.y));
      });

      drawGraph(ctx, W, H);
      graphAnim = requestAnimationFrame(tick);
    }
    tick();
  }

  function drawGraph(ctx, W, H) {
    ctx.clearRect(0, 0, W, H);
    const nodeMap = {};
    graphNodes.forEach((n) => { nodeMap[n.id] = n; });

    const layers = [[], [], [], []];
    graphNodes.forEach((n) => { layers[n.layer].push(n); });
    const sc = currentScale;
    layers.forEach((layer, li) => {
      if (!layer.length) return;
      const avgX = layer.reduce((s, n) => s + n.x, 0) / layer.length;
      ctx.font = `600 ${Math.round(18 * sc)}px "IBM Plex Mono"`;
      ctx.fillStyle = LAYER_LABEL_COLORS[li];
      ctx.globalAlpha = 0.2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(LAYER_LABELS[li].toUpperCase(), avgX, 20 * sc);
      ctx.globalAlpha = 1;
    });

    store.accounts.filter((a) => a.linkedTo).forEach((debt) => {
      const dNode = nodeMap[debt.id];
      const aNode = nodeMap[debt.linkedTo];
      if (!dNode || !aNode) return;
      ctx.beginPath();
      ctx.setLineDash([8, 6]);
      ctx.moveTo(dNode.x, dNode.y);
      ctx.lineTo(aNode.x, aNode.y);
      ctx.strokeStyle = '#9b8afb';
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
      ctx.font = `500 ${Math.round(16 * sc)}px "IBM Plex Mono"`;
      ctx.fillStyle = '#9b8afb';
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
      const col = CAT_COLORS[e.category] || '#6a7490';
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
        ctx.font = `500 ${Math.round(18 * sc)}px "IBM Plex Mono"`;
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.65;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('$' + Math.round(e.amount).toLocaleString(), mx + perpX, my + perpY - 6);
        ctx.globalAlpha = 1;
      }
    });

    graphNodes.forEach((n) => {
      const col = ACCT_COLORS[n.type] || '#6a7490';
      const isExt = n.external;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + 5, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.globalAlpha = isExt ? 0.03 : 0.06;
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = '#0f1117';
      ctx.fill();
      ctx.lineWidth = isExt ? 1.5 : 2.5;
      ctx.strokeStyle = col;
      if (isExt) { ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]); }
      else ctx.stroke();

      const bal = isExt
        ? (store.simData ? store.simData.finalBalances[n.id] || 0 : 0)
        : n.balance;
      if (bal !== 0 || !isExt) {
        ctx.font = `600 ${Math.round((isExt ? 14 : 16) * sc)}px "IBM Plex Mono"`;
        ctx.fillStyle = col;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const short = Math.abs(bal) >= 1000
          ? '$' + (Math.abs(bal) / 1000).toFixed(0) + 'k'
          : '$' + Math.round(Math.abs(bal));
        ctx.fillText(short, n.x, n.y);
      }

      ctx.font = `500 ${Math.round((isExt ? 16 : 20) * sc)}px "IBM Plex Mono"`;
      ctx.fillStyle = isExt ? '#4a5268' : '#a0a8be';
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
    let html = `<div style="font-weight:600;margin-bottom:4px;color:${ACCT_COLORS[node.type] || '#a0a8be'}">${node.label}</div>`;
    if (!node.external) html += `<div style="color:#a0a8be">Balance: <span style="color:#2dd4a8">$${(bal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>`;
    else if (bal !== 0) html += `<div style="color:#a0a8be">Cumulative: <span style="color:${bal > 0 ? '#2dd4a8' : '#ef6461'}">$${Math.abs(bal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>`;
    if (incoming.length) html += `<div style="margin-top:4px;color:#6a7490">In: ${incoming.map((ed) => '$' + Math.round(ed.amount).toLocaleString() + '/mo').join(', ')}</div>`;
    if (outgoing.length) html += `<div style="color:#6a7490">Out: ${outgoing.map((ed) => '$' + Math.round(ed.amount).toLocaleString() + '/mo').join(', ')}</div>`;
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
      dragging.x = pos.x; dragging.y = pos.y;
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
    overflow: hidden;
  }
  .graph-canvas {
    display: block;
    width: 100%;
    height: 100%;
    cursor: grab;
    touch-action: none;
  }
</style>
