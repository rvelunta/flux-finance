import { SEED_ACCOUNTS, SEED_FLOWS } from './seed.js';
import { FLOW_CAT_DISPLAY as SEED_CAT_DISPLAY } from './constants.js';
import { fmtD, parseDate } from './dates.js';
import { runSimulation } from './engine.js';

const LS_KEY = 'flux_v3';
const LEGACY_LS_KEY = 'cfe_v2e';

function loadInitial() {
  try {
    let raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_LS_KEY);
      if (raw) localStorage.removeItem(LEGACY_LS_KEY);
    }
    if (!raw) return null;
    return migrateShape(JSON.parse(raw));
  } catch { return null; }
}

function migrateShape(d) {
  if (d?.scenarios && d?.activeScenarioId) return d;
  if (d?.accounts) {
    return {
      ...d,
      scenarios: [{ id: 'baseline', name: 'Baseline', accounts: d.accounts, flows: d.flows ?? [] }],
      activeScenarioId: 'baseline',
      accounts: undefined,
      flows: undefined,
    };
  }
  return d;
}

function defaultEndFrom(startStr, months) {
  const d = parseDate(startStr) || new Date();
  d.setMonth(d.getMonth() + months);
  return fmtD(d);
}

const saved = loadInitial();
const initStart = saved?.config?.startDate ?? fmtD(new Date());
const initEnd = saved?.config?.endDate
  ?? defaultEndFrom(initStart, saved?.config?.months ?? 6);

const initialScenarios = saved?.scenarios ?? [
  { id: 'baseline', name: 'Baseline', accounts: structuredClone(SEED_ACCOUNTS), flows: structuredClone(SEED_FLOWS) },
];
const initialActiveId = saved?.activeScenarioId ?? initialScenarios[0]?.id ?? 'baseline';

export const store = $state({
  scenarios: initialScenarios,
  activeScenarioId: initialActiveId,
  compareIds: new Set(saved?.compareIds ?? []),
  compareSims: {},
  customFlowCats: saved?.customFlowCats ?? [],
  flowCatDisplay: { ...SEED_CAT_DISPLAY, ...(saved?.flowCatDisplay ?? {}) },
  config: {
    startDate: initStart,
    endDate: initEnd,
    resolution: saved?.config?.resolution ?? 'monthly',
  },
  simData: null,
  activeView: 'projection',
  chartSelectedAcctId: 'a-chk',
  acctTypeFilter: new Set(),
  flowCatFilter: new Set(),
  expandedGroups: new Set(),

  get activeScenario() {
    return this.scenarios.find((s) => s.id === this.activeScenarioId) ?? this.scenarios[0];
  },
  get accounts() {
    return this.activeScenario?.accounts ?? [];
  },
  set accounts(val) {
    const s = this.activeScenario;
    if (s) s.accounts = val;
  },
  get flows() {
    return this.activeScenario?.flows ?? [];
  },
  set flows(val) {
    const s = this.activeScenario;
    if (s) s.flows = val;
  },
});

export const ui = $state({
  accountModal: null,
  flowModal: null,
  scheduleModal: null,
});

export function openAccountModal(id = null) { ui.accountModal = { id }; }
export function closeAccountModal() { ui.accountModal = null; }
export function openFlowModal(id = null) { ui.flowModal = { id }; }
export function closeFlowModal() { ui.flowModal = null; }
export function openScheduleModal(acctId) { ui.scheduleModal = { acctId }; }
export function closeScheduleModal() { ui.scheduleModal = null; }

let nextNum = 200;
export function nid(prefix) { return prefix + '-' + (nextNum++); }

export function simulate() {
  store.simData = runSimulation(store.accounts, store.flows, store.config);
  const next = {};
  for (const id of store.compareIds) {
    if (id === store.activeScenarioId) continue;
    const s = store.scenarios.find((x) => x.id === id);
    if (s) next[id] = runSimulation(s.accounts, s.flows, store.config);
  }
  store.compareSims = next;
}

export function toggleCompare(id) {
  const next = new Set(store.compareIds);
  if (next.has(id)) next.delete(id); else next.add(id);
  store.compareIds = next;
  simulate();
  saveLS();
}

export function saveLS() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      scenarios: store.scenarios,
      activeScenarioId: store.activeScenarioId,
      compareIds: [...store.compareIds],
      customFlowCats: store.customFlowCats,
      flowCatDisplay: store.flowCatDisplay,
      config: store.config,
    }));
  } catch {}
}

export function exportJSON() {
  const data = {
    version: 'flux-v3',
    exported: new Date().toISOString(),
    scenarios: store.scenarios,
    activeScenarioId: store.activeScenarioId,
    compareIds: [...store.compareIds],
    customFlowCats: store.customFlowCats,
    flowCatDisplay: store.flowCatDisplay,
    config: store.config,
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `flux_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}

export function importJSON(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const d = migrateShape(JSON.parse(ev.target.result));
        if (d.scenarios) store.scenarios = d.scenarios;
        if (d.activeScenarioId) store.activeScenarioId = d.activeScenarioId;
        if (Array.isArray(d.compareIds)) store.compareIds = new Set(d.compareIds);
        if (d.customFlowCats) store.customFlowCats = d.customFlowCats;
        if (d.flowCatDisplay) Object.assign(store.flowCatDisplay, d.flowCatDisplay);
        if (d.config) store.config = { ...store.config, ...d.config };
        simulate();
        saveLS();
        resolve();
      } catch (err) { reject(err); }
    };
    r.readAsText(file);
  });
}

export function selectScenario(id) {
  if (store.scenarios.some((s) => s.id === id)) {
    store.activeScenarioId = id;
    simulate();
    saveLS();
  }
}

export function newScenario(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  const id = 'sc-' + Math.random().toString(36).slice(2, 8);
  const src = store.activeScenario;
  store.scenarios.push({
    id,
    name: trimmed,
    accounts: structuredClone($state.snapshot(src.accounts)),
    flows: structuredClone($state.snapshot(src.flows)),
  });
  store.activeScenarioId = id;
  simulate();
  saveLS();
  return id;
}

export function renameScenario(id, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return;
  const s = store.scenarios.find((s) => s.id === id);
  if (s) {
    s.name = trimmed;
    saveLS();
  }
}

export function deleteScenario(id) {
  if (id === 'baseline') return;
  store.scenarios = store.scenarios.filter((s) => s.id !== id);
  if (store.compareIds.has(id)) {
    const next = new Set(store.compareIds);
    next.delete(id);
    store.compareIds = next;
  }
  if (store.activeScenarioId === id) {
    store.activeScenarioId = store.scenarios[0]?.id ?? 'baseline';
  }
  simulate();
  saveLS();
}

export function addAccount(acct) {
  store.accounts.push({ id: nid('a'), ...acct });
  simulate();
  saveLS();
}

export function updateAccount(id, patch) {
  const a = store.accounts.find((x) => x.id === id);
  if (a) Object.assign(a, patch);
  simulate();
  saveLS();
}

export function deleteAccount(id) {
  store.accounts = store.accounts.filter((x) => x.id !== id);
  simulate();
  saveLS();
}

export function addFlow(flow) {
  store.flows.push({ id: nid('f'), ...flow });
  simulate();
  saveLS();
}

export function updateFlow(id, patch) {
  const f = store.flows.find((x) => x.id === id);
  if (f) Object.assign(f, patch);
  simulate();
  saveLS();
}

export function deleteFlow(id) {
  store.flows = store.flows.filter((x) => x.id !== id);
  simulate();
  saveLS();
}

export function toggleFlow(id) {
  const f = store.flows.find((x) => x.id === id);
  if (f) f.enabled = !f.enabled;
  simulate();
  saveLS();
}

simulate();
