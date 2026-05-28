<script>
  import { tick } from 'svelte';
  import { marked } from 'marked';
  import {
    store, createScenarioFromData, replaceActiveScenarioData, applyScenarioEdits,
  } from '../lib/state.svelte.js';
  import { ai, sendUserTurn, startConversation, isAIConfigured } from '../lib/ai/client.svelte.js';
  import { convertToScenario } from '../lib/ai/schema.js';
  import { fmt2 } from '../lib/format.js';

  let { onClose, mode = 'setup' } = $props();

  // ---- Local UI state -------------------------------------------------------
  let step = $state('chat');
  let userText = $state('');
  let scenarioPreview = $state(null);
  let editPreview = $state(null);
  let issues = $state([]);
  let scenarioName = $state('From AI');
  let setupTarget = $state('new'); // 'new' | 'replace'
  let applyError = $state(null);
  let transcriptEl = $state();
  let attachments = $state([]); // [{ name, text }]
  let attachError = $state(null);
  let fileInput;

  const MAX_ATTACH_BYTES = 1_000_000; // 1MB per file — plenty for a CSV/statement

  async function onAttach(e) {
    attachError = null;
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      if (file.size > MAX_ATTACH_BYTES) {
        attachError = `${file.name} is too large (max 1MB). Trim it or paste the relevant rows.`;
        continue;
      }
      try {
        const text = await file.text();
        attachments = [...attachments, { name: file.name, text }];
      } catch {
        attachError = `Couldn't read ${file.name}.`;
      }
    }
    e.target.value = '';
  }

  function removeAttachment(i) {
    attachments = attachments.filter((_, idx) => idx !== i);
  }

  marked.setOptions({ breaks: true, gfm: true });

  startConversation({
    mode,
    scenarioForContext: mode === 'edit' ? store.activeScenario : null,
  });

  const greeting = mode === 'edit'
    ? `What would you like to change in **${store.activeScenario?.name ?? 'Baseline'}**? Describe it, or **paste a CSV / statement / transaction list** and I'll fold it in.`
    : "Hi! I'll set up your accounts and recurring cash flows. Tell me about your income to start — or **paste a CSV, a copied statement, or a transaction list** and I'll structure it for you.";

  // ---- Scroll-to-bottom on new messages --------------------------------------
  async function scrollToBottom() {
    await tick();
    transcriptEl?.scrollTo({ top: transcriptEl.scrollHeight, behavior: 'smooth' });
  }

  $effect(() => {
    ai.messages.length; // track length
    if (ai.messages.length > 0) scrollToBottom();
  });

  // ---- Send / submit ---------------------------------------------------------
  async function send(forceSubmit = false) {
    if (ai.status === 'thinking' || ai.status === 'streaming') return;
    if (!userText.trim() && attachments.length === 0 && !forceSubmit) return;

    const typed = userText;
    const hasAttachments = attachments.length > 0;
    let fullText = typed;
    let displayText = null;
    if (hasAttachments) {
      const blocks = attachments
        .map((a) => `--- Attached file: ${a.name} ---\n${a.text}`)
        .join('\n\n');
      fullText = (typed ? typed + '\n\n' : '') + blocks;
      const chips = attachments.map((a) => `📎 ${a.name}`).join('  ');
      displayText = typed ? `${typed}\n${chips}` : chips;
    }

    userText = '';
    attachments = [];
    attachError = null;
    await sendUserTurn(fullText, { forceSubmit, displayText });

    if (ai.status === 'done' && ai.result) {
      if (ai.result.kind === 'setup') {
        const converted = convertToScenario(ai.result.input, store.config.startDate);
        scenarioPreview = { accounts: converted.accounts, flows: converted.flows };
        issues = converted.issues;
      } else if (ai.result.kind === 'edit') {
        editPreview = ai.result.input;
        issues = [];
      }
      step = 'preview';
    }
  }

  function onInputKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function backToChat() {
    step = 'chat';
    scenarioPreview = null;
    editPreview = null;
    applyError = null;
    ai.result = null;
    ai.status = 'awaiting-user';
  }

  function apply() {
    applyError = null;
    try {
      if (scenarioPreview) {
        if (setupTarget === 'replace') {
          replaceActiveScenarioData(scenarioPreview.accounts, scenarioPreview.flows);
        } else {
          createScenarioFromData(scenarioName.trim() || 'From AI', scenarioPreview.accounts, scenarioPreview.flows);
        }
      } else if (editPreview) {
        const { applied, skipped } = applyScenarioEdits(editPreview);
        if (skipped.length && applied === 0) {
          applyError = 'Nothing applied. Issues: ' + skipped.join('; ');
          return;
        }
        if (skipped.length) {
          // Apply partial, note skipped, but still close.
          console.warn('[ai-edit] skipped:', skipped);
        }
      }
      onClose();
    } catch (err) {
      console.error('[llm-input] apply failed:', err);
      applyError = err.message || String(err);
    }
  }

  function onBackdrop(e) { if (e.target === e.currentTarget) onClose(); }

  // ---- Setup preview math ---------------------------------------------------
  function monthlyAmt(amt, p) {
    if (p === 'monthly') return amt;
    if (p === 'semi-monthly') return amt * 2;
    if (p === '14') return amt * 26 / 12;
    if (p === '7') return amt * 52 / 12;
    if (p === 'annual') return amt / 12;
    if (p === 'quarterly') return amt / 3;
    return 0;
  }

  const monthlyIn = $derived.by(() => {
    if (!scenarioPreview) return 0;
    const chk = scenarioPreview.accounts.find((a) => a.type === 'checking');
    if (!chk) return 0;
    return scenarioPreview.flows
      .filter((f) => f.to === chk.id && f.enabled)
      .reduce((s, f) => s + monthlyAmt(+f.amount, f.period), 0);
  });
  const monthlyOut = $derived.by(() => {
    if (!scenarioPreview) return 0;
    const chk = scenarioPreview.accounts.find((a) => a.type === 'checking');
    if (!chk) return 0;
    return scenarioPreview.flows
      .filter((f) => f.from === chk.id && f.enabled)
      .reduce((s, f) => s + monthlyAmt(+f.amount, f.period), 0);
  });

  // ---- Edit preview helpers --------------------------------------------------
  const editCounts = $derived.by(() => {
    if (!editPreview) return null;
    return {
      addA: editPreview.add_accounts?.length ?? 0,
      addF: editPreview.add_flows?.length ?? 0,
      modA: editPreview.modify_accounts?.length ?? 0,
      modF: editPreview.modify_flows?.length ?? 0,
      delA: editPreview.delete_accounts?.length ?? 0,
      delF: editPreview.delete_flows?.length ?? 0,
    };
  });
  const editTotal = $derived(editCounts
    ? editCounts.addA + editCounts.addF + editCounts.modA + editCounts.modF + editCounts.delA + editCounts.delF
    : 0);

  // ---- Markdown render -------------------------------------------------------
  // Trust source: our system prompt + Claude's output + user's own input on
  // their own browser. Prototype-acceptable; for shipping add DOMPurify.
  function renderMarkdown(text) {
    return marked.parse(text ?? '');
  }
</script>

<div class="modal-overlay" role="presentation" onclick={onBackdrop} onkeydown={(e) => e.key === 'Escape' && onClose()}>
  <div class="modal llm-modal" role="dialog">
    <h3>{mode === 'edit' ? 'Edit with AI' : 'Describe your finances'}</h3>

    {#if !isAIConfigured}
      <div class="llm-setup">
        <p class="llm-setup-lead">
          The AI editor needs an Anthropic API key to talk to Claude. Your finances are sent to Anthropic's API during the conversation; everything else stays on your device.
        </p>
        <ol class="llm-setup-steps">
          <li>
            Create a key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">console.anthropic.com/settings/keys</a> (free tier works). Copy it — Anthropic only shows the full key once.
          </li>
          <li>
            Add it to <code>.env.local</code> at the project root:
            <pre>VITE_ANTHROPIC_API_KEY=sk-ant-api03-...</pre>
          </li>
          <li>
            Restart the dev server (<code>npm run dev</code>). Vite only reads env files at startup.
          </li>
        </ol>
        <p class="llm-setup-foot">
          Heads-up: in this prototype the key is bundled into the browser app. For shipping, route calls through a small proxy that holds the key server-side.
        </p>
      </div>
      <div class="mf"><button onclick={onClose}>Close</button></div>

    {:else if step === 'chat'}
      <p class="llm-subhead">
        {#if mode === 'edit'}
          Conversational edits via Claude Haiku 4.5. Your current scenario is sent to the model so it can refer to your accounts and flows by name.
        {:else}
          Conversational setup using Claude Haiku 4.5. Your responses are sent to Anthropic's API. The generated scenario lives entirely on your device.
        {/if}
      </p>

      <div bind:this={transcriptEl} class="llm-transcript">
        <div class="llm-msg assistant">
          <div class="llm-avatar">AI</div>
          <div class="llm-msg-body">{@html renderMarkdown(greeting)}</div>
        </div>
        {#each ai.messages as msg, i (i)}
          <div class="llm-msg {msg.role}">
            <div class="llm-avatar">{msg.role === 'user' ? 'You' : 'AI'}</div>
            <div class="llm-msg-body">
              {#if msg.role === 'assistant'}
                {@html renderMarkdown(msg.text)}
                {#if msg.streaming}<span class="llm-cursor">▋</span>{/if}
              {:else}
                <div class="llm-user-text">{msg.text}</div>
              {/if}
            </div>
          </div>
        {/each}
        {#if ai.status === 'thinking' || (ai.status === 'streaming' && ai.messages[ai.messages.length - 1]?.text === '')}
          <div class="llm-msg assistant">
            <div class="llm-avatar">AI</div>
            <div class="llm-msg-body llm-dots"><span></span><span></span><span></span></div>
          </div>
        {/if}
      </div>

      {#if ai.error}
        <div class="llm-error">{ai.error}</div>
      {/if}
      {#if attachError}
        <div class="llm-error">{attachError}</div>
      {/if}

      {#if attachments.length}
        <div class="llm-attachments">
          {#each attachments as a, i (i)}
            <span class="llm-attach-chip">
              📎 {a.name}
              <button type="button" class="llm-attach-x" onclick={() => removeAttachment(i)} title="Remove">×</button>
            </span>
          {/each}
        </div>
      {/if}

      <div class="llm-input-row">
        <button
          type="button"
          class="llm-attach-btn"
          onclick={() => fileInput.click()}
          disabled={ai.status === 'thinking' || ai.status === 'streaming'}
          title="Attach a CSV or text file"
        >📎</button>
        <input type="file" bind:this={fileInput} accept=".csv,.tsv,.txt,text/*" multiple style="display:none" onchange={onAttach} />
        <textarea
          bind:value={userText}
          rows="2"
          placeholder="Type a reply, paste a CSV/statement, or attach a file… (Enter to send, Shift+Enter for newline)"
          disabled={ai.status === 'thinking' || ai.status === 'streaming'}
          onkeydown={onInputKey}
        ></textarea>
        <button class="pri" disabled={ai.status === 'thinking' || ai.status === 'streaming' || (!userText.trim() && attachments.length === 0)} onclick={() => send()}>Send</button>
      </div>

      <div class="mf">
        <button onclick={onClose}>Cancel</button>
        <button disabled={ai.status === 'thinking' || ai.status === 'streaming' || ai.messages.length === 0} onclick={() => send(true)} title="Tell the model to finalise with what it knows so far">
          {mode === 'edit' ? 'Apply now →' : 'Submit now →'}
        </button>
      </div>

    {:else if step === 'preview' && scenarioPreview}
      <div class="wiz-preview">
        <div class="wp-row">
          <span class="wp-l">Accounts</span>
          <span class="wp-v">{scenarioPreview.accounts.filter((a) => !a.external).length} internal · {scenarioPreview.accounts.filter((a) => a.external).length} external</span>
        </div>
        <div class="wp-row">
          <span class="wp-l">Flows</span><span class="wp-v">{scenarioPreview.flows.length}</span>
        </div>
        <div class="wp-row">
          <span class="wp-l">Est. inflow / mo</span><span class="wp-v" style="color:var(--grn);">{fmt2(monthlyIn)}</span>
        </div>
        <div class="wp-row">
          <span class="wp-l">Est. outflow / mo</span><span class="wp-v" style="color:var(--red);">{fmt2(monthlyOut)}</span>
        </div>
        <div class="wp-row" style="border-top:1px solid var(--b1);padding-top:6px;margin-top:6px;font-weight:600;">
          <span class="wp-l">Net / mo</span>
          <span class="wp-v" style="color:{monthlyIn - monthlyOut >= 0 ? 'var(--grn)' : 'var(--red)'};">{(monthlyIn - monthlyOut >= 0 ? '+' : '')}{fmt2(monthlyIn - monthlyOut)}</span>
        </div>

        <details class="llm-details">
          <summary>Show generated accounts and flows</summary>
          <div class="llm-details-body">
            <div class="llm-details-head">Accounts</div>
            {#each scenarioPreview.accounts as a (a.id)}
              <div>{a.name} · {a.type}{a.external ? '' : ` · ${fmt2(a.balance)}`}</div>
            {/each}
            <div class="llm-details-head" style="margin-top:10px;">Flows</div>
            {#each scenarioPreview.flows as f (f.id)}
              {@const fromName = scenarioPreview.accounts.find((a) => a.id === f.from)?.name ?? '?'}
              {@const toName   = scenarioPreview.accounts.find((a) => a.id === f.to)?.name ?? '?'}
              <div>{f.name}: {fromName} → {toName} · {fmt2(f.amount)} / {f.period}</div>
            {/each}
          </div>
        </details>

        {#if issues.length}
          <div class="llm-warn" style="margin-top:10px;">
            {#each issues as msg}<div>{msg}</div>{/each}
          </div>
        {/if}

        <div class="wp-divider"></div>

        <div class="wiz-q">
          <div class="wq-pseudo-label">Where should this go?</div>
          <div class="wq-radio">
            <button type="button" class="sb-filter" class:active={setupTarget === 'new'} onclick={() => (setupTarget = 'new')}>Create new scenario</button>
            <button type="button" class="sb-filter" class:active={setupTarget === 'replace'} onclick={() => (setupTarget = 'replace')}>Replace active ({store.activeScenario?.name ?? 'Baseline'})</button>
          </div>
        </div>

        {#if setupTarget === 'new'}
          <div class="wiz-q">
            <label for="llm-scenario-name">Scenario name</label>
            <input id="llm-scenario-name" type="text" bind:value={scenarioName} />
          </div>
        {:else}
          <div class="wp-warn">This will overwrite all accounts and flows in <strong>{store.activeScenario?.name ?? 'Baseline'}</strong>.</div>
        {/if}

        {#if applyError}
          <div class="llm-error">{applyError}</div>
        {/if}
      </div>

      <div class="mf">
        <button onclick={backToChat}>← Continue chat</button>
        <button class="pri" onclick={apply}>{setupTarget === 'replace' ? 'Overwrite' : 'Create scenario'}</button>
      </div>

    {:else if step === 'preview' && editPreview}
      <div class="wiz-preview">
        {#if editPreview.summary}
          <div class="llm-edit-summary">{editPreview.summary}</div>
        {/if}

        <div class="wp-row">
          <span class="wp-l">Total changes</span>
          <span class="wp-v">{editTotal}</span>
        </div>

        {#if editCounts.addA > 0}
          <div class="llm-edit-section">
            <div class="llm-edit-head">+ Add accounts ({editCounts.addA})</div>
            {#each editPreview.add_accounts as a, i (i)}
              <div class="llm-edit-row pos">{a.name} · {a.type} · {fmt2(a.balance)}{a.annualRate ? ` · ${(a.annualRate * 100).toFixed(2)}%` : ''}</div>
            {/each}
          </div>
        {/if}

        {#if editCounts.addF > 0}
          <div class="llm-edit-section">
            <div class="llm-edit-head">+ Add flows ({editCounts.addF})</div>
            {#each editPreview.add_flows as f, i (i)}
              <div class="llm-edit-row pos">{f.name}: {f.from} → {f.to} · {fmt2(f.amount)} / {f.period}</div>
            {/each}
          </div>
        {/if}

        {#if editCounts.modA > 0}
          <div class="llm-edit-section">
            <div class="llm-edit-head">~ Modify accounts ({editCounts.modA})</div>
            {#each editPreview.modify_accounts as m, i (i)}
              <div class="llm-edit-row mod">{m.target}: {Object.entries(m.patch).map(([k, v]) => `${k}=${v}`).join(', ')}</div>
            {/each}
          </div>
        {/if}

        {#if editCounts.modF > 0}
          <div class="llm-edit-section">
            <div class="llm-edit-head">~ Modify flows ({editCounts.modF})</div>
            {#each editPreview.modify_flows as m, i (i)}
              <div class="llm-edit-row mod">{m.target}: {Object.entries(m.patch).map(([k, v]) => `${k}=${v}`).join(', ')}</div>
            {/each}
          </div>
        {/if}

        {#if editCounts.delA > 0}
          <div class="llm-edit-section">
            <div class="llm-edit-head">− Delete accounts ({editCounts.delA})</div>
            {#each editPreview.delete_accounts as name, i (i)}
              <div class="llm-edit-row neg">{name}</div>
            {/each}
          </div>
        {/if}

        {#if editCounts.delF > 0}
          <div class="llm-edit-section">
            <div class="llm-edit-head">− Delete flows ({editCounts.delF})</div>
            {#each editPreview.delete_flows as name, i (i)}
              <div class="llm-edit-row neg">{name}</div>
            {/each}
          </div>
        {/if}

        {#if editTotal === 0}
          <div class="llm-warn" style="margin-top:10px;">The model returned no edits. Try rephrasing.</div>
        {/if}

        {#if applyError}
          <div class="llm-error">{applyError}</div>
        {/if}
      </div>

      <div class="mf">
        <button onclick={backToChat}>← Continue chat</button>
        <button class="pri" disabled={editTotal === 0} onclick={apply}>Apply to {store.activeScenario?.name ?? 'Baseline'}</button>
      </div>
    {/if}
  </div>
</div>
