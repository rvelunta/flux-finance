<script>
  import { store, createScenarioFromData, replaceActiveScenarioData } from '../lib/state.svelte.js';
  import { TEMPLATES } from '../lib/wizard/templates.js';
  import { fmt2 } from '../lib/format.js';
  import { PER_LABELS } from '../lib/constants.js';

  let { onClose } = $props();

  let step = $state('pick');
  let templateId = $state(null);
  let answers = $state({});
  let scenarioName = $state('From wizard');
  let mode = $state('new');
  let preview = $state(null);

  const template = $derived(TEMPLATES.find((t) => t.id === templateId) ?? null);

  function pickTemplate(id) {
    templateId = id;
    const t = TEMPLATES.find((x) => x.id === id);
    answers = {};
    if (t) for (const q of t.questions) answers[q.id] = q.default ?? '';
    step = 'fill';
  }

  function buildPreview() {
    if (!template) return;
    try {
      const ctx = { startDate: store.config.startDate };
      preview = template.build(answers, ctx);
      step = 'preview';
    } catch (err) {
      alert('Could not build scenario: ' + err.message);
    }
  }

  let applyError = $state(null);
  function apply() {
    if (!preview) return;
    applyError = null;
    try {
      if (mode === 'replace') {
        replaceActiveScenarioData(preview.accounts, preview.flows);
      } else {
        createScenarioFromData(scenarioName.trim() || template.label, preview.accounts, preview.flows);
      }
      onClose();
    } catch (err) {
      console.error('[wizard] apply failed:', err);
      applyError = err.message || String(err);
    }
  }

  function onBackdrop(e) { if (e.target === e.currentTarget) onClose(); }

  const monthlyOutflow = $derived.by(() => {
    if (!preview) return 0;
    const chk = preview.accounts.find((a) => a.type === 'checking');
    if (!chk) return 0;
    let sum = 0;
    for (const f of preview.flows) {
      if (f.from !== chk.id || !f.enabled) continue;
      const p = f.period;
      if (p === 'monthly') sum += +f.amount;
      else if (p === 'semi-monthly') sum += +f.amount * 2;
      else if (p === '14') sum += +f.amount * 26 / 12;
      else if (p === '7') sum += +f.amount * 52 / 12;
      else if (p === 'annual') sum += +f.amount / 12;
      else if (p === 'quarterly') sum += +f.amount / 3;
    }
    return sum;
  });

  const monthlyInflow = $derived.by(() => {
    if (!preview) return 0;
    const chk = preview.accounts.find((a) => a.type === 'checking');
    if (!chk) return 0;
    let sum = 0;
    for (const f of preview.flows) {
      if (f.to !== chk.id || !f.enabled) continue;
      const p = f.period;
      if (p === 'monthly') sum += +f.amount;
      else if (p === 'semi-monthly') sum += +f.amount * 2;
      else if (p === '14') sum += +f.amount * 26 / 12;
      else if (p === '7') sum += +f.amount * 52 / 12;
      else if (p === 'annual') sum += +f.amount / 12;
      else if (p === 'quarterly') sum += +f.amount / 3;
    }
    return sum;
  });
</script>

<div class="modal-overlay" role="presentation" onclick={onBackdrop} onkeydown={(e) => e.key === 'Escape' && onClose()}>
  <div class="modal" role="dialog" style="width:560px;">
    <h3>New scenario from template</h3>

    <div class="wiz-steps">
      <span class="wiz-step" class:active={step === 'pick'} class:done={step !== 'pick'}>1 · Template</span>
      <span class="wiz-step" class:active={step === 'fill'} class:done={step === 'preview'}>2 · Numbers</span>
      <span class="wiz-step" class:active={step === 'preview'}>3 · Apply</span>
    </div>

    {#if step === 'pick'}
      <div class="wiz-tmpls">
        {#each TEMPLATES as t (t.id)}
          <button type="button" class="wiz-tmpl" onclick={() => pickTemplate(t.id)}>
            <div class="wt-label">{t.label}</div>
            <div class="wt-desc">{t.description}</div>
          </button>
        {/each}
      </div>
      <div class="mf">
        <button onclick={onClose}>Cancel</button>
      </div>
    {:else if step === 'fill' && template}
      <div class="wiz-form">
        {#each template.questions as q (q.id)}
          <div class="wiz-q">
            <label for={`wq-${q.id}`}>
              {q.label}
              {#if q.optional}<span class="wq-opt">optional</span>{/if}
            </label>
            {#if q.type === 'radio'}
              <div class="wq-radio">
                {#each q.options as opt (opt.value)}
                  <button type="button" class="sb-filter" class:active={answers[q.id] === opt.value} onclick={() => (answers[q.id] = opt.value)}>{opt.label}</button>
                {/each}
              </div>
            {:else if q.type === 'number'}
              <div class="wq-num">
                {#if q.prefix}<span class="wq-affix">{q.prefix}</span>{/if}
                <input id={`wq-${q.id}`} type="number" step={q.step ?? 1} min={q.min} bind:value={answers[q.id]} />
                {#if q.suffix}<span class="wq-affix">{q.suffix}</span>{/if}
              </div>
            {:else}
              <input id={`wq-${q.id}`} type="text" bind:value={answers[q.id]} />
            {/if}
            {#if q.hint}<div class="wq-hint">{q.hint}</div>{/if}
          </div>
        {/each}
      </div>
      <div class="mf">
        <button onclick={() => (step = 'pick')}>← Back</button>
        <button class="pri" onclick={buildPreview}>Preview →</button>
      </div>
    {:else if step === 'preview' && preview}
      <div class="wiz-preview">
        <div class="wp-row">
          <span class="wp-l">Accounts</span><span class="wp-v">{preview.accounts.filter((a) => !a.external).length} internal · {preview.accounts.filter((a) => a.external).length} external</span>
        </div>
        <div class="wp-row">
          <span class="wp-l">Flows</span><span class="wp-v">{preview.flows.length}</span>
        </div>
        <div class="wp-row">
          <span class="wp-l">Est. inflow / mo</span><span class="wp-v" style="color:var(--grn);">{fmt2(monthlyInflow)}</span>
        </div>
        <div class="wp-row">
          <span class="wp-l">Est. outflow / mo</span><span class="wp-v" style="color:var(--red);">{fmt2(monthlyOutflow)}</span>
        </div>
        <div class="wp-row" style="border-top:1px solid var(--b1);padding-top:6px;margin-top:6px;font-weight:600;">
          <span class="wp-l">Net / mo</span>
          <span class="wp-v" style="color:{monthlyInflow - monthlyOutflow >= 0 ? 'var(--grn)' : 'var(--red)'};">{(monthlyInflow - monthlyOutflow >= 0 ? '+' : '')}{fmt2(monthlyInflow - monthlyOutflow)}</span>
        </div>

        <div class="wp-divider"></div>

        <div class="wiz-q">
          <label>Where should this go?</label>
          <div class="wq-radio">
            <button type="button" class="sb-filter" class:active={mode === 'new'} onclick={() => (mode = 'new')}>Create new scenario</button>
            <button type="button" class="sb-filter" class:active={mode === 'replace'} onclick={() => (mode = 'replace')}>Replace active ({store.activeScenario?.name ?? 'Baseline'})</button>
          </div>
        </div>

        {#if mode === 'new'}
          <div class="wiz-q">
            <label for="wq-scenario-name">Scenario name</label>
            <input id="wq-scenario-name" type="text" bind:value={scenarioName} />
          </div>
        {:else}
          <div class="wp-warn">This will overwrite all accounts and flows in <strong>{store.activeScenario?.name ?? 'Baseline'}</strong>.</div>
        {/if}
      </div>

      {#if applyError}
        <div style="font-family:var(--mono);font-size:10px;color:var(--red);background:var(--red2);padding:8px 10px;border-radius:4px;margin-top:8px;">{applyError}</div>
      {/if}

      <div class="mf">
        <button onclick={() => (step = 'fill')}>← Back</button>
        <button class="pri" onclick={apply}>{mode === 'replace' ? 'Overwrite' : 'Create scenario'}</button>
      </div>
    {/if}
  </div>
</div>
