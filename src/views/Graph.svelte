<script>
  import { onMount, onDestroy } from 'svelte';
  import { store } from '../lib/state.svelte.js';
  import { ACCT_COLORS, CAT_COLORS } from '../lib/constants.js';
  import { toMonthlyAmt } from '../lib/format.js';
  import { theme, cssVar } from '../lib/theme.svelte.js';

  let canvas;
  let tooltip;
  let showMode = $state('all');
  let showLabels = $state(true);
  let ctrlOpen = $state(false);
  let selectedId = $state(null);   // focused node id, or null for the resting overview

  let graphNodes = [];
  let graphEdges = [];
  let graphAnim = null;
  let graphInited = false;
  let currentDpr = 1;
  let currentScale = 1;
  let graphLayout = null;

  // Layers stack top → bottom: income enters at the top and meets friction on the
  // way down. Ordered so every cross-layer flow points downward — assets pay down
  // into debts below them, and everything drains to expenses at the bottom.
  const LAYER_LABELS = ['Income', 'Deductions', 'Assets', 'Debts', 'Expenses'];
  const LAYER_LABEL_COLORS = ['#2dd4a8', '#ef6461', '#5b9cf6', '#9b8afb', '#f0b952'];

  function getLayer(acct) {
    if (acct.type === 'income-source') return 0;     // Income (top)
    if (acct.type === 'tax') return 1;               // Deductions
    if (acct.type === 'expense' && acct.name.toLowerCase().includes('benefit')) return 1;  // Benefits → Deductions
    if (!acct.external) return acct.type === 'debt' ? 3 : 2;  // internal: Debts vs Assets
    return 4;                                        // Expenses (external)
  }

  // Layered layout: each non-empty layer is a horizontal band, stacked top →
  // bottom. Within a band the node order is refined by a barycenter pass — each
  // node drifts toward the average X of the nodes it connects to in adjacent
  // bands — which lines connected nodes up vertically and reduces crossings.
  // Returns node positions, per-band metrics, and the total canvas height.
  function buildLayeredLayout(nodes, edges, W, rNode, sc) {
    const layers = LAYER_LABELS.map(() => []);
    nodes.forEach((n) => { layers[n.layer].push(n); });

    const adj = {};
    nodes.forEach((n) => { adj[n.id] = []; });
    edges.forEach((e) => {
      if (adj[e.from] && adj[e.to]) { adj[e.from].push(e.to); adj[e.to].push(e.from); }
    });

    const padX = W * 0.06;
    const usableW = W - padX * 2;
    const labelH = 26 * sc;
    const padV = 76 * sc;
    const cellW = rNode * 2 + 52 * sc;
    const cellH = rNode * 2 + 150 * sc;
    const perRow = Math.max(1, Math.floor(usableW / cellW));

    // Band geometry — one band per non-empty layer, indexed by layer number.
    const bands = [];
    let y = 28 * sc;
    layers.forEach((layer, li) => {
      if (!layer.length) { bands[li] = null; return; }
      const rows = Math.ceil(layer.length / perRow);
      const top = y;
      const gridTop = top + labelH;
      const gridH = rows * cellH;
      const bottom = gridTop + gridH + padV;
      bands[li] = { layer: li, top, bottom, labelY: top + 14 * sc, nodeTop: gridTop, nodeBottom: gridTop + gridH, gridTop };
      y = bottom;
    });
    const totalH = y + 28 * sc;

    const positions = {};
    const place = (list, band) => {
      list.forEach((n, i) => {
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        const inRow = Math.min(perRow, list.length - row * perRow);
        const slotW = usableW / inRow;
        positions[n.id] = { x: padX + slotW * (col + 0.5), y: band.gridTop + cellH * (row + 0.5) };
      });
    };

    // Initial placement in input order, then a few barycenter ordering sweeps.
    const order = layers.map((l) => l.slice());
    order.forEach((list, li) => { if (list.length) place(list, bands[li]); });
    for (let pass = 0; pass < 5; pass++) {
      const idxs = order.map((_, i) => i);
      const seq = pass % 2 === 0 ? idxs : idxs.reverse();
      for (const li of seq) {
        const list = order[li];
        if (!list || list.length <= 1) continue;
        const tx = {};
        list.forEach((n) => {
          const nb = adj[n.id];
          tx[n.id] = nb.length
            ? nb.reduce((s, id) => s + (positions[id] ? positions[id].x : positions[n.id].x), 0) / nb.length
            : positions[n.id].x;
        });
        list.sort((a, b) => tx[a.id] - tx[b.id]);
        place(list, bands[li]);
      }
    }

    return { positions, bands: bands.filter(Boolean), totalH };
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

      const nodeIds = new Set(nodeList.map((n) => n.id));
      const validFlows = activeFlows.filter((f) => nodeIds.has(f.from) && nodeIds.has(f.to));

      const layout = buildLayeredLayout(nodeList, validFlows, W, rNode, sc);
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
        // Ease-in: nodes start at the horizontal centre and slide out to their
        // computed X; a re-layout instead eases from the node's current spot.
        const sx = existing ? existing.x : W / 2;
        const sy = existing ? existing.y : p.y;
        return {
          ...n,
          x: sx, y: sy,
          sx, sy, tx: p.x, ty: p.y,
          r: rNode,
          bandTop: band ? band.nodeTop : 0,
          bandBottom: band ? band.nodeBottom : totalH,
        };
      });

      const edgeMap = {};
      validFlows.forEach((f) => {
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
      startEaseIn();
    }, 50);
  }

  function resetLayout() { graphInited = false; initGraph(true); }

  function draw() {
    if (!canvas) return;
    drawGraph(canvas.getContext('2d'), canvas.width, canvas.height);
  }

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  // One-time ease-in: slide nodes from their start positions to the computed
  // layout, then stop. There's no continuous simulation — the graph is static
  // once settled (and after a drag), so nothing wanders.
  function startEaseIn() {
    if (graphAnim) cancelAnimationFrame(graphAnim);
    const dur = 460;
    let t0 = null;
    const tick = (now) => {
      if (t0 === null) t0 = now;
      const t = Math.min(1, (now - t0) / dur);
      const e = easeOutCubic(t);
      graphNodes.forEach((n) => {
        n.x = n.sx + (n.tx - n.sx) * e;
        n.y = n.sy + (n.ty - n.sy) * e;
      });
      draw();
      if (t < 1) graphAnim = requestAnimationFrame(tick);
      else graphAnim = null;
    };
    graphAnim = requestAnimationFrame(tick);
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
    // Focus: when a node is selected, light up just it, its incident edges, and
    // its direct neighbours; everything else recedes to a faint ghost. Tapping a
    // lit neighbour re-focuses onto it (traverse).
    const sel = selectedId;
    const litNodes = new Set();
    const litEdges = new Set();
    if (sel && nodeMap[sel]) {
      litNodes.add(sel);
      graphEdges.forEach((e) => {
        if (e.from === sel || e.to === sel) {
          litEdges.add(e);
          litNodes.add(e.from === sel ? e.to : e.from);
        }
      });
    }
    const focus = litNodes.size > 0;
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

    if (!focus) store.accounts.filter((a) => a.linkedTo).forEach((debt) => {
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
      const isLit = litEdges.has(e);
      const ghost = focus && !isLit;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = dx / dist, ny = dy / dist;
      const x1 = a.x + nx * a.r, y1 = a.y + ny * a.r;
      const x2 = b.x - nx * b.r, y2 = b.y - ny * b.r;
      const col = CAT_COLORS[e.category] || cFallback;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      // Gentle bow so parallel fan edges don't perfectly overlap.
      const cpOff = Math.max(30, dist * 0.2);
      const perpX = -(y2 - y1) / dist * cpOff * 0.08;
      const perpY = (x2 - x1) / dist * cpOff * 0.08;

      // Three tiers: lit (focused edge), ghost (faded context), resting (calm
      // uniform bundle — no width-by-amount, no arrowheads, no labels).
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(mx + perpX, my + perpY, x2, y2);
      if (ghost) { ctx.strokeStyle = cFallback; ctx.lineWidth = 1.2 * sc; ctx.globalAlpha = 0.06; }
      else if (isLit) { ctx.strokeStyle = col; ctx.lineWidth = e.width * 2; ctx.globalAlpha = 0.5; }
      else { ctx.strokeStyle = col; ctx.lineWidth = 1.6 * sc; ctx.globalAlpha = 0.22; }
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (isLit) {
        const angle = Math.atan2(y2 - (my + perpY), x2 - (mx + perpX));
        const hl = 12 + e.width;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - hl * Math.cos(angle - 0.35), y2 - hl * Math.sin(angle - 0.35));
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - hl * Math.cos(angle + 0.35), y2 - hl * Math.sin(angle + 0.35));
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(2, e.width);
        ctx.globalAlpha = 0.7;
        ctx.stroke();
        ctx.globalAlpha = 1;

        if (showLabels && e.amount > 0) {
          ctx.font = `500 ${Math.round(13 * sc)}px "IBM Plex Mono"`;
          ctx.fillStyle = col;
          ctx.globalAlpha = 0.9;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText('$' + Math.round(e.amount).toLocaleString(), mx + perpX, my + perpY - 6);
          ctx.globalAlpha = 1;
        }
      }
    });

    graphNodes.forEach((n) => {
      const col = ACCT_COLORS[n.type] || cFallback;
      const isExt = n.external;
      const dim = focus && !litNodes.has(n.id);
      const isSel = n.id === sel;

      // Non-focused nodes recede to a faint outline (no fill/text) while focusing.
      if (dim) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.16;
        ctx.lineWidth = isExt ? 1.5 : 2;
        if (isExt) { ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]); }
        else ctx.stroke();
        ctx.globalAlpha = 1;
        return;
      }

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

      // Emphasis ring on the selected node.
      if (isSel) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + 6, 0, Math.PI * 2);
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.9;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

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

  function hideTooltip() { if (tooltip) tooltip.style.display = 'none'; }

  // Tap a node to focus it; tap a lit neighbour to traverse onto it; tap the
  // focused node again or empty space to release. No dragging — a swipe just
  // scrolls the tall canvas (a tap fires click, a scroll doesn't).
  function onCanvasClick(e) {
    const node = hitNode(getPos(e.clientX, e.clientY));
    if (node && node.id !== selectedId) {
      selectedId = node.id;
      showTooltip(node, e.clientX, e.clientY);
    } else {
      selectedId = null;
      hideTooltip();
    }
  }

  function onCanvasMove(e) {
    canvas.style.cursor = hitNode(getPos(e.clientX, e.clientY)) ? 'pointer' : 'default';
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

  // Changing the visible flow set re-lays-out; toggling labels or the theme just
  // repaints (the graph is otherwise static).
  $effect(() => {
    showMode;
    if (graphInited) initGraph();
  });
  $effect(() => {
    showLabels; theme.mode; selectedId;
    if (graphInited) draw();
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
      onclick={onCanvasClick}
      onmousemove={onCanvasMove}
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
    cursor: default;
    touch-action: pan-y;
  }
</style>
