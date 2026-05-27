<script>
  import { auth, signInWithPassword, signUpWithPassword, signInWithMagicLink } from '../lib/sync.svelte.js';

  let { onClose } = $props();

  let mode = $state('signin');
  let email = $state('');
  let password = $state('');
  let busy = $state(false);

  async function submitPassword() {
    if (busy) return;
    if (!email.trim() || !password) { auth.error = 'Email and password required'; return; }
    busy = true;
    const res = mode === 'signin'
      ? await signInWithPassword(email, password)
      : await signUpWithPassword(email, password);
    busy = false;
    if (res.ok && mode === 'signin') onClose();
  }

  async function submitMagicLink() {
    if (busy) return;
    if (!email.trim()) { auth.error = 'Email required'; return; }
    busy = true;
    await signInWithMagicLink(email);
    busy = false;
  }

  function onBackdrop(e) { if (e.target === e.currentTarget) onClose(); }

  const signupMessage = $derived(
    auth.user && mode === 'signup'
      ? 'Account created. Check your email if confirmation is enabled, then sign in.'
      : null
  );
</script>

<div class="modal-overlay" role="presentation" onclick={onBackdrop} onkeydown={(e) => e.key === 'Escape' && onClose()}>
  <div class="modal" role="dialog" style="width:400px;">
    <h3>{mode === 'signin' ? 'Sign in' : 'Create account'}</h3>

    <div style="display:flex;gap:4px;margin-bottom:16px;">
      <button class="sb-filter" class:active={mode === 'signin'} onclick={() => { mode = 'signin'; auth.error = null; auth.magicLinkSentTo = null; }}>Sign in</button>
      <button class="sb-filter" class:active={mode === 'signup'} onclick={() => { mode = 'signup'; auth.error = null; auth.magicLinkSentTo = null; }}>Sign up</button>
    </div>

    {#if auth.magicLinkSentTo}
      <div style="font-family:var(--mono);font-size:11px;color:var(--grn);padding:12px;background:var(--grn2);border-radius:4px;margin-bottom:12px;">
        Magic link sent to <strong>{auth.magicLinkSentTo}</strong>. Open the email and click the link to finish signing in.
      </div>
    {/if}

    {#if signupMessage}
      <div style="font-family:var(--mono);font-size:11px;color:var(--blu);padding:12px;background:var(--blu2);border-radius:4px;margin-bottom:12px;">
        {signupMessage}
      </div>
    {/if}

    <div class="fr full">
      <label for="auth-email">Email</label>
      <input id="auth-email" type="email" bind:value={email} placeholder="you@example.com" autocomplete="email" />
    </div>
    <div class="fr full">
      <label for="auth-password">Password</label>
      <input id="auth-password" type="password" bind:value={password} placeholder={mode === 'signup' ? 'pick a strong one' : ''} autocomplete={mode === 'signin' ? 'current-password' : 'new-password'} onkeydown={(e) => e.key === 'Enter' && submitPassword()} />
    </div>

    {#if auth.error}
      <div style="font-family:var(--mono);font-size:10px;color:var(--red);margin-top:6px;">{auth.error}</div>
    {/if}

    <div class="mf" style="flex-direction:column;align-items:stretch;gap:8px;">
      <button class="pri" disabled={busy} onclick={submitPassword}>
        {busy ? 'Working…' : (mode === 'signin' ? 'Sign in' : 'Create account')}
      </button>
      <div style="display:flex;align-items:center;gap:8px;color:var(--t4);font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:0.5px;">
        <span style="flex:1;height:1px;background:var(--b1);"></span>
        or
        <span style="flex:1;height:1px;background:var(--b1);"></span>
      </div>
      <button disabled={busy} onclick={submitMagicLink}>Send magic link</button>
      <button onclick={onClose} style="margin-top:4px;color:var(--t3);border-color:transparent;background:transparent;">Cancel</button>
    </div>
  </div>
</div>
