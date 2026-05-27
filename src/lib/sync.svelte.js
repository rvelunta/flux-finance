import { supabase, isSupabaseConfigured } from './supabase.js';
import {
  hasLocalData,
  snapshotPersisted,
  applyPersistedShape,
  saveLS,
  setAfterSaveHook,
} from './state.svelte.js';

const PUSH_DEBOUNCE_MS = 800;

export const auth = $state({
  user: null,
  status: isSupabaseConfigured ? 'loading' : 'unconfigured',
  error: null,
  magicLinkSentTo: null,
  conflict: null,
});

let pushTimer = null;
let suspendPush = false;

function clearPushTimer() {
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
}

async function pushNow() {
  if (!auth.user) return;
  const blob = snapshotPersisted();
  const { error } = await supabase
    .from('user_data')
    .upsert({ user_id: auth.user.id, data: blob }, { onConflict: 'user_id' });
  if (error) console.error('[flux:sync] push failed:', error.message);
}

function queuePush() {
  if (!auth.user || suspendPush) return;
  clearPushTimer();
  pushTimer = setTimeout(() => { pushTimer = null; pushNow(); }, PUSH_DEBOUNCE_MS);
}

async function fetchServer() {
  const { data, error } = await supabase
    .from('user_data')
    .select('data, updated_at')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function summarize(blob) {
  if (!blob) return { scenarios: 0, accounts: 0, flows: 0 };
  const scenarios = blob.scenarios?.length ?? 0;
  let accounts = 0, flows = 0;
  (blob.scenarios ?? []).forEach((s) => {
    accounts += s.accounts?.length ?? 0;
    flows += s.flows?.length ?? 0;
  });
  return { scenarios, accounts, flows };
}

async function onSignedIn(session) {
  auth.user = session.user;
  auth.status = 'signed-in';
  auth.error = null;
  auth.magicLinkSentTo = null;
  suspendPush = true;
  try {
    const server = await fetchServer();
    const localHasData = hasLocalData();
    if (server && localHasData) {
      auth.conflict = {
        local: summarize(snapshotPersisted()),
        server: summarize(server.data),
        serverData: server.data,
        serverUpdatedAt: server.updated_at,
      };
    } else if (server) {
      applyPersistedShape(server.data);
      saveLS();
    } else {
      await pushNow();
    }
  } catch (err) {
    console.error('[flux:sync] sign-in load failed:', err.message);
  } finally {
    suspendPush = false;
  }
}

function onSignedOut() {
  clearPushTimer();
  auth.user = null;
  auth.status = 'signed-out';
  auth.conflict = null;
}

export async function resolveConflict(keep) {
  const c = auth.conflict;
  if (!c) return;
  if (keep === 'local') {
    auth.conflict = null;
    await pushNow();
  } else if (keep === 'server') {
    suspendPush = true;
    try {
      applyPersistedShape(c.serverData);
      saveLS();
    } finally {
      suspendPush = false;
    }
    auth.conflict = null;
  }
}

export async function initAuth() {
  if (!isSupabaseConfigured) return;
  setAfterSaveHook(queuePush);
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    await onSignedIn(data.session);
  } else {
    auth.status = 'signed-out';
  }
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) onSignedIn(session);
    else if (event === 'SIGNED_OUT') onSignedOut();
    else if (event === 'TOKEN_REFRESHED' && session) auth.user = session.user;
  });
}

function wrap(promise) {
  auth.error = null;
  return promise.then(({ error }) => {
    if (error) {
      auth.error = error.message;
      return { ok: false, error: error.message };
    }
    return { ok: true };
  });
}

export function signInWithPassword(email, password) {
  return wrap(supabase.auth.signInWithPassword({ email: email.trim(), password }));
}

export function signUpWithPassword(email, password) {
  return wrap(supabase.auth.signUp({ email: email.trim(), password }));
}

export async function signInWithMagicLink(email) {
  auth.error = null;
  const trimmed = email.trim();
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) {
    auth.error = error.message;
    return { ok: false, error: error.message };
  }
  auth.magicLinkSentTo = trimmed;
  return { ok: true };
}

export async function signOut() {
  await supabase.auth.signOut();
}
