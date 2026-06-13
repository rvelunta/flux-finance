// Anthropic proxy — keeps the API key server-side so it never ships to clients.
//
// The browser/app calls this function with the user's Supabase access token.
// We verify it represents a real signed-in *user* (not just the public anon
// key), then forward the request body to Anthropic with the real key and stream
// the response straight back.
//
// Deploy (Supabase CLI):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy anthropic-proxy
//
// SUPABASE_URL / SUPABASE_ANON_KEY are auto-injected by the platform — don't set them.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// Echo back whatever headers the browser asks for in the preflight. The
// Anthropic SDK (with dangerouslyAllowBrowser) sends anthropic-dangerous-
// direct-browser-access and several x-stainless-* headers; a fixed allow-list
// would miss them and the browser would block the request as a CORS failure.
function corsFor(req: Request): Record<string, string> {
  const requested = req.headers.get('Access-Control-Request-Headers');
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      requested ?? 'authorization, content-type, anthropic-version, anthropic-beta, x-api-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  // --- Auth: require a real authenticated user, not the public anon key ------
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json(401, { error: 'Missing Authorization bearer token' });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) return json(401, { error: 'Not authenticated' });

  // --- Forward to Anthropic with the real key --------------------------------
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json(500, { error: 'Proxy is missing ANTHROPIC_API_KEY' });

  const body = await req.text();
  const beta = req.headers.get('anthropic-beta');
  const upstream = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': req.headers.get('anthropic-version') ?? '2023-06-01',
      ...(beta ? { 'anthropic-beta': beta } : {}),
    },
    body,
  });

  // Pipe the response (SSE stream or JSON) straight through to the client.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...cors,
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
    },
  });
});
