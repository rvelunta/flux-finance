<script>
  import { auth, signOut } from '../lib/sync.svelte.js';
  import { exportJSON, importJSON } from '../lib/state.svelte.js';

  let { onOpenAuth } = $props();

  let menuOpen = $state(false);
  let fileInput;

  function onDocClick(e) {
    if (!e.target.closest('#accountMenuWrap')) menuOpen = false;
  }

  async function onSignOut() {
    menuOpen = false;
    await signOut();
  }

  function onSignIn() {
    menuOpen = false;
    onOpenAuth?.();
  }

  function onExportClick() {
    menuOpen = false;
    exportJSON();
  }

  function onImportClick() {
    menuOpen = false;
    fileInput?.click();
  }

  function onImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    importJSON(file).catch(() => alert('Invalid JSON'));
    e.target.value = '';
  }

  const triggerLabel = $derived(
    auth.status === 'loading'  ? '…' :
    auth.status === 'unconfigured' ? 'local-only' :
    auth.user ? auth.user.email :
    'Account'
  );
</script>

<svelte:document onclick={onDocClick} />

<div class="account-menu" id="accountMenuWrap">
  <button
    type="button"
    class="account-trigger"
    class:signed-out={!auth.user}
    onclick={(e) => { e.stopPropagation(); menuOpen = !menuOpen; }}
    title={auth.user?.email ?? 'Account'}
  >
    <span class="am-dot" class:off={!auth.user}></span>
    <span class="am-email">{triggerLabel}</span>
    <span class="am-caret">{menuOpen ? '▴' : '▾'}</span>
  </button>
  {#if menuOpen}
    <div class="account-menu-list">
      {#if auth.user}
        <div class="aml-meta">Signed in</div>
        <div class="aml-email" title={auth.user.email}>{auth.user.email}</div>
        <button type="button" class="aml-action" onclick={onSignOut}>Sign out</button>
      {:else if auth.status === 'signed-out'}
        <div class="aml-meta">Not signed in</div>
        <button type="button" class="aml-action pri-action" onclick={onSignIn}>Sign in</button>
      {:else}
        <div class="aml-meta">{auth.status === 'unconfigured' ? 'Local-only (auth not configured)' : 'Loading…'}</div>
      {/if}

      <div class="aml-divider"></div>
      <div class="aml-meta">Data</div>
      <button type="button" class="aml-action" onclick={onExportClick}>Export…</button>
      <button type="button" class="aml-action" onclick={onImportClick}>Import…</button>
    </div>
  {/if}
</div>

<input type="file" bind:this={fileInput} accept=".json" style="display:none" onchange={onImportFile} />
