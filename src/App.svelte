<script>
  import {
    store, ui, exportJSON, importJSON,
    closeAccountModal, closeFlowModal, closeScheduleModal,
    selectScenario, newScenario, renameScenario, deleteScenario,
  } from './lib/state.svelte.js';
  import Projection from './views/Projection.svelte';
  import Accounts from './views/Accounts.svelte';
  import Flows from './views/Flows.svelte';
  import Graph from './views/Graph.svelte';
  import KpiBanner from './components/KpiBanner.svelte';
  import AccountModal from './components/AccountModal.svelte';
  import FlowModal from './components/FlowModal.svelte';
  import ScheduleModal from './components/ScheduleModal.svelte';
  import AccountMenu from './components/AccountMenu.svelte';
  import AuthModal from './components/AuthModal.svelte';
  import ConflictModal from './components/ConflictModal.svelte';
  import { initAuth, auth } from './lib/sync.svelte.js';
  import { onMount } from 'svelte';

  const FIRST_RUN_KEY = 'flux_first_run_dismissed';
  let fileInput;
  let menuOpen = $state(false);
  let scenarioMenuOpen = $state(false);
  let authModalOpen = $state(false);
  let firstRunDismissed = $state(
    typeof localStorage !== 'undefined' && localStorage.getItem(FIRST_RUN_KEY) === '1'
  );

  function dismissFirstRun() {
    try { localStorage.setItem(FIRST_RUN_KEY, '1'); } catch {}
    firstRunDismissed = true;
  }

  $effect(() => {
    if (auth.user && !firstRunDismissed) dismissFirstRun();
  });

  const showFirstRun = $derived(
    !firstRunDismissed && !auth.user && auth.status !== 'loading' && auth.status !== 'unconfigured'
  );

  onMount(() => { initAuth(); });

  const tabs = [
    { id: 'projection', label: 'Projection' },
    { id: 'accounts', label: 'Accounts' },
    { id: 'flows', label: 'Flows' },
    { id: 'graph', label: 'Graph' },
  ];

  const currentTab = $derived(tabs.find((t) => t.id === store.activeView) ?? tabs[0]);

  function onImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    importJSON(file).catch(() => alert('Invalid JSON'));
    e.target.value = '';
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      closeAccountModal();
      closeFlowModal();
      closeScheduleModal();
      menuOpen = false;
      scenarioMenuOpen = false;
    }
  }

  function onDocClick(e) {
    if (!e.target.closest('#tabMenuWrap')) menuOpen = false;
    if (!e.target.closest('#scenarioMenuWrap')) scenarioMenuOpen = false;
  }

  function selectTab(id) {
    store.activeView = id;
    menuOpen = false;
  }

  function onNewScenario() {
    const name = prompt('New scenario name:', `Scenario ${store.scenarios.length + 1}`);
    if (name?.trim()) newScenario(name);
  }

  function onRenameScenario(e, s) {
    e.preventDefault();
    const name = prompt('Rename scenario:', s.name);
    if (name && name.trim() && name.trim() !== s.name) renameScenario(s.id, name);
  }

  function onDeleteScenario(e, s) {
    e.stopPropagation();
    if (confirm(`Delete scenario "${s.name}"?`)) deleteScenario(s.id);
  }
</script>

<svelte:window onkeydown={onKey} />
<svelte:document onclick={onDocClick} />

<div class="chrome">
  <div class="topbar">
    <h1>FLUX <em>v3</em></h1>
    <div class="scenario-menu" id="scenarioMenuWrap">
      <button
        type="button"
        class="scenario-menu-trigger"
        onclick={(e) => { e.stopPropagation(); scenarioMenuOpen = !scenarioMenuOpen; }}
        title="Switch scenario"
      >
        <span class="sm-label">Scenario</span>
        <span class="sm-name">{store.activeScenario?.name ?? 'Baseline'}</span>
        <span class="sm-caret">{scenarioMenuOpen ? '▴' : '▾'}</span>
      </button>
      {#if scenarioMenuOpen}
        <div class="scenario-menu-list">
          {#each store.scenarios as s (s.id)}
            <div class="sm-row" class:active={store.activeScenarioId === s.id}>
              <button
                type="button"
                class="sm-pick"
                onclick={() => { selectScenario(s.id); scenarioMenuOpen = false; }}
                oncontextmenu={(e) => onRenameScenario(e, s)}
                title="Click to switch · Right-click to rename"
              >{s.name}</button>
              <button
                type="button"
                class="sm-edit"
                onclick={(e) => { e.stopPropagation(); onRenameScenario(e, s); }}
                title="Rename"
              >✎</button>
              {#if s.id !== 'baseline'}
                <button
                  type="button"
                  class="sm-del"
                  onclick={(e) => onDeleteScenario(e, s)}
                  title="Delete"
                >×</button>
              {/if}
            </div>
          {/each}
          <button
            type="button"
            class="sm-fork"
            onclick={() => { onNewScenario(); scenarioMenuOpen = false; }}
          >+ Fork active</button>
        </div>
      {/if}
    </div>
    <div class="topbar-r">
      <button onclick={exportJSON}>Export</button>
      <button onclick={() => fileInput.click()}>Import</button>
      <input type="file" bind:this={fileInput} accept=".json" style="display:none" onchange={onImport} />
      <AccountMenu onOpenAuth={() => (authModalOpen = true)} />
    </div>
  </div>

  {#if showFirstRun}
    <div class="first-run-banner">
      <span class="frb-msg">Sign in to back up your scenarios and sync them across devices. Your data stays on this device until you do.</span>
      <button class="frb-cta" onclick={() => { authModalOpen = true; }}>Sign in</button>
      <button class="frb-dismiss" onclick={dismissFirstRun} title="Don't show again">Maybe later</button>
    </div>
  {/if}

  <KpiBanner />

  <div class="tabs">
    {#each tabs as tab}
      <button
        type="button"
        class="tab"
        class:active={store.activeView === tab.id}
        onclick={() => (store.activeView = tab.id)}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <div class="tab-menu" id="tabMenuWrap">
    <button
      type="button"
      class="tab-menu-trigger"
      onclick={(e) => { e.stopPropagation(); menuOpen = !menuOpen; }}
    >
      <span>{currentTab.label}</span>
      <span class="tm-caret">{menuOpen ? '▴' : '▾'}</span>
    </button>
    {#if menuOpen}
      <div class="tab-menu-list">
        {#each tabs as tab}
          <button
            type="button"
            class:active={store.activeView === tab.id}
            onclick={() => selectTab(tab.id)}
          >
            {tab.label}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if store.activeView === 'projection'}
    <Projection />
  {:else if store.activeView === 'accounts'}
    <Accounts />
  {:else if store.activeView === 'flows'}
    <Flows />
  {:else if store.activeView === 'graph'}
    <Graph />
  {/if}
</div>

{#if ui.accountModal}
  <AccountModal />
{/if}
{#if ui.flowModal}
  <FlowModal />
{/if}
{#if ui.scheduleModal}
  <ScheduleModal />
{/if}
{#if authModalOpen && !auth.user}
  <AuthModal onClose={() => (authModalOpen = false)} />
{/if}
<ConflictModal />
