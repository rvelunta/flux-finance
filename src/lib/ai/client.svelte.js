import { SETUP_SYSTEM_PROMPT, EDIT_SYSTEM_PROMPT_TEMPLATE } from './prompt.js';
import { SUBMIT_SCENARIO_TOOL, APPLY_EDITS_TOOL, summarizeScenario } from './schema.js';
import { supabase, isSupabaseConfigured } from '../supabase.js';

// The Anthropic key lives server-side in the "anthropic-proxy" Supabase Edge
// Function. The client calls that proxy with the user's Supabase access token;
// the proxy verifies the user and forwards to Anthropic with the real key.
// Nothing secret ships to the browser/app.
const PROXY_URL = isSupabaseConfigured
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/anthropic-proxy`
  : null;

// "Configured" = the backend (Supabase) exists. Actually *using* it also needs
// the user signed in — checked per request in sendUserTurn.
export const isAIConfigured = isSupabaseConfigured;

export const MODEL_ID = 'claude-haiku-4-5';

// Lazy-imported so the SDK only loads when the user opens the modal.
let Anthropic = null;
let client = null;

async function ensureClient() {
  if (client) return client;
  if (!PROXY_URL) return null;
  const mod = await import('@anthropic-ai/sdk');
  Anthropic = mod.default;
  client = new Anthropic({
    apiKey: 'proxied-no-key', // unused; the proxy injects the real key
    baseURL: PROXY_URL,
    dangerouslyAllowBrowser: true, // safe now — no real key in the browser
  });
  return client;
}

async function currentAccessToken() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export const ai = $state({
  // 'idle' | 'unconfigured' | 'thinking' | 'streaming' | 'awaiting-user' | 'done' | 'error'
  status: isAIConfigured ? 'idle' : 'unconfigured',
  // UI-facing transcript. Each: { role, text, streaming? }
  messages: [],
  error: null,
  // Set when the model calls a terminal tool.
  // For setup mode: { kind: 'setup', input } (full scenario)
  // For edit mode: { kind: 'edit', input } (apply_edits diff)
  result: null,
  mode: 'setup', // 'setup' | 'edit'
});

let apiMessages = [];
let activeMode = 'setup';
let scenarioContext = '';

export function startConversation({ mode = 'setup', scenarioForContext = null } = {}) {
  ai.mode = mode;
  ai.messages = [];
  ai.error = null;
  ai.result = null;
  ai.status = isAIConfigured ? 'idle' : 'unconfigured';
  apiMessages = [];
  activeMode = mode;
  scenarioContext = mode === 'edit' ? summarizeScenario(scenarioForContext) : '';
}

function buildSystem() {
  const text = activeMode === 'edit'
    ? EDIT_SYSTEM_PROMPT_TEMPLATE(scenarioContext)
    : SETUP_SYSTEM_PROMPT;
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
}

function activeTools() {
  return activeMode === 'edit' ? [APPLY_EDITS_TOOL] : [SUBMIT_SCENARIO_TOOL];
}

function terminalToolName() {
  return activeMode === 'edit' ? 'apply_edits' : 'submit_scenario';
}

// `displayText` lets the caller show a clean transcript line (e.g. "📎 statement.csv")
// while sending the full payload (file contents) to the model.
export async function sendUserTurn(userText, { forceSubmit = false, displayText = null } = {}) {
  const c = await ensureClient();
  if (!c) {
    ai.error = 'AI backend not configured (missing Supabase project).';
    ai.status = 'error';
    return;
  }
  const token = await currentAccessToken();
  if (!token) {
    ai.error = 'Sign in to use the AI assistant — it runs in the cloud.';
    ai.status = 'error';
    return;
  }
  const text = userText.trim();
  if (!text && !forceSubmit) return;

  const finalText = forceSubmit
    ? (text
        ? text + `\n\nPlease call ${terminalToolName()} now with what we have.`
        : `Please call ${terminalToolName()} now with what we have.`)
    : text;

  ai.messages.push({ role: 'user', text: displayText ?? finalText });
  apiMessages.push({ role: 'user', content: finalText });
  ai.status = 'streaming';
  ai.error = null;

  // Create a placeholder assistant message we'll stream into.
  const placeholder = { role: 'assistant', text: '', streaming: true };
  ai.messages.push(placeholder);
  const placeholderIdx = ai.messages.length - 1;

  try {
    const stream = c.messages.stream({
      model: MODEL_ID,
      max_tokens: 2048,
      system: buildSystem(),
      tools: activeTools(),
      messages: apiMessages,
    }, {
      // Per-request so the token is always fresh (sessions refresh ~hourly).
      headers: { Authorization: `Bearer ${token}` },
    });

    stream.on('text', (delta) => {
      ai.messages[placeholderIdx] = {
        ...ai.messages[placeholderIdx],
        text: ai.messages[placeholderIdx].text + delta,
      };
    });

    const final = await stream.finalMessage();

    // Mark streaming done; drop the placeholder if it ended up empty.
    if (!final.content.some((b) => b.type === 'text' && b.text)) {
      ai.messages.splice(placeholderIdx, 1);
    } else {
      ai.messages[placeholderIdx] = {
        ...ai.messages[placeholderIdx],
        streaming: false,
      };
    }

    apiMessages.push({ role: 'assistant', content: final.content });

    if (final.stop_reason === 'tool_use') {
      const toolUse = final.content.find((b) => b.type === 'tool_use' && b.name === terminalToolName());
      if (toolUse) {
        ai.result = { kind: activeMode, input: toolUse.input };
        ai.status = 'done';
        return;
      }
    }
    ai.status = 'awaiting-user';
  } catch (err) {
    console.error('[ai] turn failed:', err);
    ai.status = 'error';
    // Remove the streaming placeholder on error.
    if (ai.messages[placeholderIdx]?.streaming) ai.messages.splice(placeholderIdx, 1);
    const isAuth = Anthropic && err instanceof Anthropic.AuthenticationError;
    const isRate = Anthropic && err instanceof Anthropic.RateLimitError;
    const isAPI  = Anthropic && err instanceof Anthropic.APIError;
    if (isAuth) ai.error = 'Session rejected by the proxy. Try signing out and back in; if it persists, the proxy may be missing its ANTHROPIC_API_KEY secret.';
    else if (isRate) ai.error = 'Rate limited. Wait a moment and try again.';
    else if (isAPI) ai.error = `Proxy/API error ${err.status}: ${err.message}`;
    else ai.error = err.message || String(err);
  }
}
