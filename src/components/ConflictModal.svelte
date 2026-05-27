<script>
  import { auth, resolveConflict } from '../lib/sync.svelte.js';

  let busy = $state(false);

  async function pick(which) {
    if (busy) return;
    busy = true;
    await resolveConflict(which);
    busy = false;
  }
</script>

{#if auth.conflict}
  {@const c = auth.conflict}
  <div class="modal-overlay" role="presentation">
    <div class="modal" role="dialog" style="width:480px;">
      <h3>Choose which data to keep</h3>
      <p style="font-family:var(--mono);font-size:11px;color:var(--t2);line-height:1.5;margin-bottom:16px;">
        You have data on this device <em>and</em> on your account. Pick one — the other will be discarded. (Export from File menu first if you want a backup.)
      </p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div style="border:1px solid var(--b1);border-radius:6px;padding:14px;background:var(--s2);">
          <div style="font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:var(--t4);margin-bottom:8px;">This device</div>
          <div style="font-family:var(--mono);font-size:11px;line-height:1.7;color:var(--t1);">
            {c.local.scenarios} scenario{c.local.scenarios !== 1 ? 's' : ''}<br/>
            {c.local.accounts} account{c.local.accounts !== 1 ? 's' : ''}<br/>
            {c.local.flows} flow{c.local.flows !== 1 ? 's' : ''}
          </div>
          <button class="pri" disabled={busy} onclick={() => pick('local')} style="margin-top:10px;width:100%;">Keep device → upload</button>
        </div>
        <div style="border:1px solid var(--b1);border-radius:6px;padding:14px;background:var(--s2);">
          <div style="font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:var(--t4);margin-bottom:8px;">Your account</div>
          <div style="font-family:var(--mono);font-size:11px;line-height:1.7;color:var(--t1);">
            {c.server.scenarios} scenario{c.server.scenarios !== 1 ? 's' : ''}<br/>
            {c.server.accounts} account{c.server.accounts !== 1 ? 's' : ''}<br/>
            {c.server.flows} flow{c.server.flows !== 1 ? 's' : ''}
          </div>
          <button class="pri" disabled={busy} onclick={() => pick('server')} style="margin-top:10px;width:100%;">Keep account → replace device</button>
        </div>
      </div>
    </div>
  </div>
{/if}
