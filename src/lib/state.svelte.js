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
    return JSON.parse(raw);
  } catch { return null; }
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

export const store = $state({
  accounts: saved?.accounts ?? structuredClone(SEED_ACCOUNTS),
  flows: saved?.flows ?? structuredClone(SEED_FLOWS),
  customFlowCats: saved?.customFlowCats ?? [],
  flowCatDisplay: { ...SEED_CAT_DISPLAY, ...(saved?.flowCatDisplay ?? {}) },
  config: {
    startDate: initStart,
    endDate: initEnd,
    resolution: saved?.config?.resolution ?? 'monthly',
  },
  simData: null,
  activeView: 'projection',
  chartSelectedAccts: new Set(['a-chk']),
  acctTypeFilter: new Set(),
  flowCatFilter: new Set(),
  expandedGroups: new Set(),
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
}

export function saveLS() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      accounts: store.accounts,
      flows: store.flows,
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
    accounts: store.accounts,
    flows: store.flows,
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
        const d = JSON.parse(ev.target.result);
        if (d.accounts) store.accounts = d.accounts;
        if (d.flows) store.flows = d.flows;
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
