export default async function handler(req: any, res: any) {
  const url = process.env.TURSO_URL?.replace('libsql://', 'https://');
  const token = process.env.TURSO_AUTH_TOKEN;

  if (!url || !token) {
    return res.status(500).json({ error: 'Turso env missing' });
  }

  try {
    const response = await fetch(`${url}/v2/pipeline`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          { type: 'execute', stmt: { sql: "SELECT value FROM configs WHERE key = 'BACKEND_URL' LIMIT 1" } },
          { type: 'close' }
        ]
      })
    });

    const data: any = await response.json();
    const result = data.results?.[0]?.response?.result;
    const backendUrl = result?.rows?.[0]?.[0]?.value;

    if (!backendUrl) {
      return res.status(404).json({ error: 'URL not found' });
    }

    res.setHeader('Cache-Control', 's-maxage=0, stale-while-revalidate=0');
    return res.status(200).json({ url: backendUrl });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
