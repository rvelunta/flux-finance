<script>
  import { auth, signOut } from '../lib/sync.svelte.js';

  let { onOpenAuth } = $props();

  let menuOpen = $state(false);

  function onDocClick(e) {
    if (!e.target.closest('#accountMenuWrap')) menuOpen = false;
  }

  async function onSignOut() {
    menuOpen = false;
    await signOut();
  }
</script>

<svelte:document onclick={onDocClick} />

{#if auth.status === 'unconfigured'}
  <span title="Auth not configured (missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY)" style="font-family:var(--mono);font-size:10px;color:var(--t4);">local-only</span>
{:else if auth.status === 'loading'}
  <span style="font-family:var(--mono);font-size:10px;color:var(--t4);">…</span>
{:else if auth.user}
  <div class="account-menu" id="accountMenuWrap">
    <button
      type="button"
      class="account-trigger"
      onclick={(e) => { e.stopPropagation(); menuOpen = !menuOpen; }}
      title={auth.user.email}
    >
      <span class="am-dot"></span>
      <span class="am-email">{auth.user.email}</span>
      <span class="am-caret">{menuOpen ? '▴' : '▾'}</span>
    </button>
    {#if menuOpen}
      <div class="account-menu-list">
        <div class="aml-meta">Signed in</div>
        <div class="aml-email" title={auth.user.email}>{auth.user.email}</div>
        <button type="button" class="aml-action" onclick={onSignOut}>Sign out</button>
      </div>
    {/if}
  </div>
{:else}
  <button type="button" onclick={onOpenAuth}>Sign in</button>
{/if}
