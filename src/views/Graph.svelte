<script>
  import { onMount, onDestroy } from 'svelte';
  import { store } from '../lib/state.svelte.js';
  import { ACCT_COLORS, CAT_COLORS } from '../lib/constants.js';
  import { toMonthlyAmt } from '../lib/format.js';

  let canvas;
  let tooltip;
  let showMode = $state('all');
  let showLabels = $state(true);

  let graphNodes = [];
  let graphEdges = [];
  let graphAnim = null;
  let graphDrag = null;
  let graphInited = false;

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
      const dpr = 2;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (cssW < 50 || cssH < 50) return;
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;

      const showEnabled = showMode === 'enabled';
      const activeFlows = store.flows.filter((f) => showEnabled ? f.enabled : true);
      const W = canvas.width, H = canvas.height;

      const referencedIds = new Set();
      activeFlows.forEach((f) => { referencedIds.add(f.from); referencedIds.add(f.to); });
      const nodeList = store.accounts
        .filter((a) => !a.external || referencedIds.has(a.id))
        .map((a) => ({ id: a.id, label: a.name, type: a.type, balance: a.balance, external: !!a.external, layer: getLayer(a) }));

      const preset = buildLayeredPositions(nodeList, W, H);

      graphNodes = nodeList.map((n) => {
        const existing = (!forceReset && graphInited) ? graphNodes.find((gn) => gn.id === n.id) : null;
        const p = preset[n.id] || { x: W / 2, y: H / 2 };
        return { ...n, x: existing ? existing.x : p.x, y: existing ? existing.y : p.y, vx: 0, vy: 0, r: n.external ? 28 : 40 };
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
    layers.forEach((layer, li) => {
      if (!layer.length) return;
      const avgX = layer.reduce((s, n) => s + n.x, 0) / layer.length;
      ctx.font = '600 18px "IBM Plex Mono"';
      ctx.fillStyle = LAYER_LABEL_COLORS[li];
      ctx.globalAlpha = 0.2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(LAYER_LABELS[li].toUpperCase(), avgX, 20);
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
      ctx.font = '500 16px "IBM Plex Mono"';
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
        ctx.font = '500 18px "IBM Plex Mono"';
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
        ctx.font = `600 ${isExt ? 14 : 16}px "IBM Plex Mono"`;
        ctx.fillStyle = col;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const short = Math.abs(bal) >= 1000
          ? '$' + (Math.abs(bal) / 1000).toFixed(0) + 'k'
          : '$' + Math.round(Math.abs(bal));
        ctx.fillText(short, n.x, n.y);
      }

      ctx.font = `500 ${isExt ? 16 : 20}px "IBM Plex Mono"`;
      ctx.fillStyle = isExt ? '#4a5268' : '#a0a8be';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const label = n.label.length > 14 ? n.label.slice(0, 13) + '…' : n.label;
      ctx.fillText(label, n.x, n.y + n.r + 8);
    });
  }

  let dragging = null;
  let hovered = null;

  function getPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * 2, y: (e.clientY - r.top) * 2 };
  }

  function hitNode(pos) {
    return graphNodes.find((n) => Math.hypot(n.x - pos.x, n.y - pos.y) < n.r + 8);
  }

  function onMouseDown(e) {
    const pos = getPos(e);
    const node = hitNode(pos);
    if (node) { dragging = node; graphDrag = node; canvas.style.cursor = 'grabbing'; }
  }

  function onMouseMove(e) {
    const pos = getPos(e);
    if (dragging) {
      dragging.x = pos.x; dragging.y = pos.y;
      dragging.vx = 0; dragging.vy = 0;
      return;
    }
    const node = hitNode(pos);
    if (node && node !== hovered) {
      hovered = node;
      canvas.style.cursor = 'pointer';
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
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top = (e.clientY + 14) + 'px';
    } else if (!node) {
      hovered = null;
      canvas.style.cursor = 'grab';
      tooltip.style.display = 'none';
    }
  }

  function onMouseUp() { dragging = null; graphDrag = null; canvas.style.cursor = 'grab'; }
  function onMouseLeave() {
    dragging = null; graphDrag = null; canvas.style.cursor = 'grab';
    tooltip.style.display = 'none'; hovered = null;
  }
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
    showMode; showLabels;
    if (graphInited) initGraph();
  });
</script>

<div class="view active" style="flex-direction:column;overflow:hidden;">
  <div class="ctrl">
    <label for="graphMode">Show</label>
    <select id="graphMode" bind:value={showMode}>
      <option value="all">All flows</option>
      <option value="enabled">Enabled only</option>
    </select>
    <label style="margin-left:12px;display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11px;color:var(--t1);">
      <input type="checkbox" bind:checked={showLabels} /> Amounts
    </label>
    <button onclick={resetLayout} style="margin-left:auto;">Reset layout</button>
  </div>
  <canvas
    bind:this={canvas}
    style="display:block;cursor:grab;width:100%;height:calc(100vh - 140px);"
    onmousedown={onMouseDown}
    onmousemove={onMouseMove}
    onmouseup={onMouseUp}
    onmouseleave={onMouseLeave}
  ></canvas>
  <div
    bind:this={tooltip}
    style="display:none;position:fixed;background:var(--s2);border:1px solid var(--b2);border-radius:6px;padding:10px 14px;font-family:var(--mono);font-size:11px;pointer-events:none;z-index:10;max-width:260px;"
  ></div>
</div>
