<script>
  import {
    store, ui,
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
  import LLMInputModal from './components/LLMInputModal.svelte';
  import WizardModal from './components/WizardModal.svelte';
  import { initAuth, auth } from './lib/sync.svelte.js';
  import { theme, toggleTheme } from './lib/theme.svelte.js';
  import { isMobile } from './lib/platform.js';
  import { fly, fade } from 'svelte/transition';
  import { onMount } from 'svelte';

  const FIRST_RUN_KEY = 'flux_first_run_dismissed';
  let menuOpen = $state(false);
  let scenarioMenuOpen = $state(false);
  let authModalOpen = $state(false);
  let llmModalOpen = $state(false);
  let llmModalMode = $state('setup');
  let wizardModalOpen = $state(false);
  let planSheetOpen = $state(false);

  function openLLM(mode) {
    llmModalMode = mode;
    llmModalOpen = true;
  }
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

  // Inline stroke icons for the mobile bottom tab bar (SF-Symbol-ish, currentColor).
  const TAB_ICONS = {
    projection: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 2 5-6"/></svg>',
    accounts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-5 9 5"/><path d="M5 9v8M9 9v8M15 9v8M19 9v8"/><path d="M3 20h18"/></svg>',
    flows: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v13M4 7l3-3 3 3"/><path d="M17 20V7M14 17l3 3 3-3"/></svg>',
    graph: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="6" r="2"/><circle cx="18" cy="9" r="2"/><circle cx="9" cy="18" r="2"/><path d="M6.8 7L16 8.6M8.4 16.4L16.2 10.2M7.4 7.6L8.7 16"/></svg>',
  };

  // "Plan hub" icon for the center of the bottom bar (stacked layers = scenarios).
  const PLAN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5"/></svg>';

  // Bottom-bar order: visualizations (Projection, Graph) left, tables (Accounts,
  // Flows) right, with the plan button between them. Independent of desktop tab order.
  const BOTTOM_NAV = ['projection', 'graph', 'accounts', 'flows'].map((id) => tabs.find((t) => t.id === id));

  const currentTab = $derived(tabs.find((t) => t.id === store.activeView) ?? tabs[0]);
  const otherScenarios = $derived(store.scenarios.filter((s) => s.id !== store.activeScenarioId));

  function onKey(e) {
    if (e.key === 'Escape') {
      closeAccountModal();
      closeFlowModal();
      closeScheduleModal();
      menuOpen = false;
      scenarioMenuOpen = false;
      planSheetOpen = false;
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
  <div class="topbar" class:is-mobile={isMobile}>
    {#if !isMobile}<h1>FLUX</h1>{/if}
    <div class="topbar-r">
    {#if !isMobile}
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
          <button
            type="button"
            class="sm-fork"
            onclick={() => { wizardModalOpen = true; scenarioMenuOpen = false; }}
          >+ New from template</button>
          <button
            type="button"
            class="sm-fork"
            onclick={() => { openLLM('setup'); scenarioMenuOpen = false; }}
          >+ Describe your finances</button>
        </div>
      {/if}
    </div>
    {/if}
      <button
        type="button"
        class="theme-toggle"
        onclick={toggleTheme}
        title={theme.mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        aria-label="Toggle color theme"
      >{theme.mode === 'dark' ? '☀' : '☾'}</button>
      {#if !isMobile}
      <button
        type="button"
        class="ai-btn"
        onclick={() => openLLM('edit')}
        title="Edit the active scenario in conversation"
      >✦ AI Edit</button>
      {/if}
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

  {#if !isMobile}
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
  {/if}

  {#if store.activeView === 'projection'}
    <Projection />
  {:else if store.activeView === 'accounts'}
    <Accounts />
  {:else if store.activeView === 'flows'}
    <Flows />
  {:else if store.activeView === 'graph'}
    <Graph />
  {/if}

  {#if isMobile}
    <nav class="bottom-nav">
      {#each BOTTOM_NAV as tab, i}
        {#if i === 2}
          <button
            type="button"
            class="bn-center"
            class:open={planSheetOpen}
            onclick={() => (planSheetOpen = true)}
            aria-label={`Scenario: ${store.activeScenario?.name ?? 'Baseline'}`}
          >
            <span class="bn-center-icon">{@html PLAN_ICON}</span>
            <span class="bn-label">{store.activeScenario?.name ?? 'Baseline'}</span>
          </button>
        {/if}
        <button
          type="button"
          class="bn-item"
          class:active={store.activeView === tab.id}
          onclick={() => (store.activeView = tab.id)}
          aria-label={tab.label}
          aria-current={store.activeView === tab.id ? 'page' : undefined}
        >
          <span class="bn-icon">{@html TAB_ICONS[tab.id]}</span>
          <span class="bn-label">{tab.label}</span>
        </button>
      {/each}
    </nav>
  {/if}

  {#if planSheetOpen}
    <div
      class="sheet-overlay"
      transition:fade={{ duration: 150 }}
      onclick={() => (planSheetOpen = false)}
      role="presentation"
    >
      <div class="sheet" transition:fly={{ y: 320, duration: 240 }} onclick={(e) => e.stopPropagation()}>
        <div class="sheet-grab"></div>

        <div class="sheet-active">
          <span class="sheet-active-dot"></span>
          <span class="sheet-active-name">{store.activeScenario?.name ?? 'Baseline'}</span>
          <span class="sheet-active-tag">active</span>
          <button
            type="button"
            class="sheet-row-act"
            onclick={(e) => onRenameScenario(e, store.activeScenario)}
            aria-label="Rename active scenario"
          >✎</button>
        </div>

        {#if otherScenarios.length}
          <div class="sheet-sec-label">Switch to</div>
          {#each otherScenarios as s (s.id)}
            <div class="sheet-row">
              <button
                type="button"
                class="sheet-row-pick"
                onclick={() => { selectScenario(s.id); planSheetOpen = false; }}
              >{s.name}</button>
              <button type="button" class="sheet-row-act" onclick={(e) => onRenameScenario(e, s)} aria-label="Rename">✎</button>
              {#if s.id !== 'baseline'}
                <button type="button" class="sheet-row-act" onclick={(e) => onDeleteScenario(e, s)} aria-label="Delete">×</button>
              {/if}
            </div>
          {/each}
        {/if}

        <div class="sheet-divider"></div>
        <button type="button" class="sheet-action" onclick={() => { onNewScenario(); planSheetOpen = false; }}>+ Fork active</button>
        <button type="button" class="sheet-action" onclick={() => { wizardModalOpen = true; planSheetOpen = false; }}>+ New from template</button>
        <button type="button" class="sheet-action ai" onclick={() => { openLLM('setup'); planSheetOpen = false; }}>✦ Describe your finances</button>

        <div class="sheet-divider"></div>
        <button type="button" class="sheet-action ai primary" onclick={() => { openLLM('edit'); planSheetOpen = false; }}>✦ AI Edit this plan</button>
      </div>
    </div>
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
{#if llmModalOpen}
  <LLMInputModal
    onClose={() => (llmModalOpen = false)}
    mode={llmModalMode}
    onRequestSignIn={() => (authModalOpen = true)}
  />
{/if}
{#if wizardModalOpen}
  <WizardModal onClose={() => (wizardModalOpen = false)} />
{/if}
<ConflictModal />
