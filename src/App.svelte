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

  let fileInput;
  let menuOpen = $state(false);

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
    }
  }

  function onDocClick(e) {
    if (!e.target.closest('#tabMenuWrap')) menuOpen = false;
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
    <div class="scenario-bar">
      {#each store.scenarios as s (s.id)}
        <button
          type="button"
          class="sc-chip"
          class:active={store.activeScenarioId === s.id}
          onclick={() => selectScenario(s.id)}
          oncontextmenu={(e) => onRenameScenario(e, s)}
          title="Click to switch · Right-click to rename"
        >
          {s.name}
          {#if s.id !== 'baseline'}
            <span
              class="sc-chip-x"
              role="button"
              tabindex="-1"
              onclick={(e) => onDeleteScenario(e, s)}
              onkeydown={(e) => e.key === 'Enter' && onDeleteScenario(e, s)}
              title="Delete"
            >×</span>
          {/if}
        </button>
      {/each}
      <button type="button" class="sc-chip sc-chip-new" onclick={onNewScenario} title="Fork active scenario">+ Fork</button>
    </div>
    <div class="topbar-r">
      <button onclick={exportJSON}>Export</button>
      <button onclick={() => fileInput.click()}>Import</button>
      <input type="file" bind:this={fileInput} accept=".json" style="display:none" onchange={onImport} />
    </div>
  </div>

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
