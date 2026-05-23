<script>
  import {
    store, ui, exportJSON, importJSON,
    closeAccountModal, closeFlowModal, closeScheduleModal,
  } from './lib/state.svelte.js';
  import Projection from './views/Projection.svelte';
  import Accounts from './views/Accounts.svelte';
  import Flows from './views/Flows.svelte';
  import Graph from './views/Graph.svelte';
  import OtherTools from './views/OtherTools.svelte';
  import AccountModal from './components/AccountModal.svelte';
  import FlowModal from './components/FlowModal.svelte';
  import ScheduleModal from './components/ScheduleModal.svelte';

  let fileInput;

  const tabs = [
    { id: 'projection', label: 'Projection' },
    { id: 'accounts', label: 'Accounts' },
    { id: 'flows', label: 'Flows' },
    { id: 'graph', label: 'Graph' },
    { id: 'other-tools', label: 'Other tools' },
  ];

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
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="chrome">
  <div class="topbar">
    <h1>FLUX <em>v3 // flow engine</em></h1>
    <div class="topbar-r">
      <button onclick={exportJSON}>Export</button>
      <button onclick={() => fileInput.click()}>Import</button>
      <input type="file" bind:this={fileInput} accept=".json" style="display:none" onchange={onImport} />
    </div>
  </div>

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

  {#if store.activeView === 'projection'}
    <Projection />
  {:else if store.activeView === 'accounts'}
    <Accounts />
  {:else if store.activeView === 'flows'}
    <Flows />
  {:else if store.activeView === 'graph'}
    <Graph />
  {:else if store.activeView === 'other-tools'}
    <OtherTools />
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
