/*
* FCM HTTP v1 transport for send-push. mints an OAuth2 access token from a
* Firebase service account (RS256 JWT -> token exchange), caches it in memory,
* and sends messages. Deno runtime (uses crypto.subtle) — excluded from the
* app's tsc/eslint, validated by Deno at deploy.
*/

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

export type ServiceAccount = {
  projectId: string;
  clientEmail: string;
  privateKey: string; // PEM PKCS8, with real newlines
};

export type SendResult = 'ok' | 'invalid-token' | 'error';

let cached: { token: string; expiresAt: number } | null = null;

function base64url(bytes: Uint8Array): string {
  let str = '';
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str)
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/u, '');
}

function base64urlJson(value: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/u, '')
    .replace(/-----END PRIVATE KEY-----/u, '')
    .replace(/\s+/gu, '');
  const binary = atob(body);
  const buffer = new Uint8Array(binary.length);
  for (let idx = 0; idx < binary.length; idx += 1) {
    buffer[idx] = binary.charCodeAt(idx);
  }
  return buffer.buffer;
}

async function signJwt(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.clientEmail,
    scope: FCM_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64urlJson(header)}.${base64urlJson(claim)}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(sa.privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${base64url(new Uint8Array(signature))}`;
}

export async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) return cached.token;
  const assertion = await signJwt(sa);
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cached = {
    token: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return cached.token;
}

// sends one FCM v1 message. returns 'invalid-token' when FCM reports the token
// is dead so the caller can prune it.
export async function sendMessage(
  projectId: string,
  accessToken: string,
  message: Record<string, unknown>
): Promise<SendResult> {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    }
  );
  if (res.ok) return 'ok';
  const text = await res.text();
  if (
    res.status === 404 ||
    (res.status === 400 &&
      /registration-token|INVALID_ARGUMENT|UNREGISTERED/iu.test(text))
  ) {
    return 'invalid-token';
  }
  console.error('[send-push] FCM send failed', res.status, text);
  return 'error';
}
