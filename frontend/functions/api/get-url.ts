interface Env {
  TURSO_URL: string;
  TURSO_AUTH_TOKEN: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = context.env.TURSO_URL?.replace('libsql://', 'https://');
  const token = context.env.TURSO_AUTH_TOKEN;

  if (!url || !token) {
    return new Response(JSON.stringify({ error: 'Turso env missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const response = await fetch(`${url}/v1/pipeline`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          { type: 'execute', stmt: { sql: 'SELECT value FROM config WHERE key = "backend_url"' } },
          { type: 'close' }
        ]
      })
    });

    const data: any = await response.json();
    const result = data.results?.[0]?.response?.result;
    const backendUrl = result?.rows?.[0]?.[0]?.value;

    if (!backendUrl) {
      return new Response(JSON.stringify({ error: 'URL not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ url: backendUrl }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=0, stale-while-revalidate=0'
      }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
