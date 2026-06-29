// spotify-token — mints a short-lived spotify app token (client-credentials).
// id/secret live as supabase function secrets, never in the app bundle; the
// app only ever receives the throwaway token. set + deploy with:
//   supabase secrets set SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy
//   supabase functions deploy spotify-token

const TOKEN_URL = 'https://accounts.spotify.com/api/token';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// reuse the token across warm invocations; refresh 60s early
let cached: { token: string; expiresAt: number } | null = null;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const id = Deno.env.get('SPOTIFY_CLIENT_ID');
  const secret = Deno.env.get('SPOTIFY_CLIENT_SECRET');
  if (!id || !secret) return json({ error: 'not configured' }, 503);

  if (cached && Date.now() < cached.expiresAt) {
    return json({
      access_token: cached.token,
      expires_in: Math.round((cached.expiresAt - Date.now()) / 1000),
    });
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) return json({ error: 'spotify auth failed' }, 502);
    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    cached = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    return json({ access_token: data.access_token, expires_in: data.expires_in });
  } catch {
    return json({ error: 'upstream error' }, 502);
  }
});
