interface ApiResponse {
  status: (code: number) => {
    json: (data: Record<string, unknown>) => void;
  };
  setHeader: (name: string, value: string) => void;
}

export default async function handler(_req: unknown, res: ApiResponse): Promise<void> {
  const url = process.env.TURSO_URL?.replace('libsql://', 'https://');
  const token = process.env.TURSO_AUTH_TOKEN;

  if (!url || !token) {
    res.status(500).json({ error: 'Turso env missing' });
    return;
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

    type TursoResponse = {
        results?: Array<{
            response?: {
                result?: {
                    rows?: Array<Array<{ value: string }>>;
                };
            };
        }>;
    };

    const data = (await response.json()) as TursoResponse;
    const result = data.results?.[0]?.response?.result;
    const backendUrl = result?.rows?.[0]?.[0]?.value;

    if (!backendUrl) {
      res.status(404).json({ error: 'URL not found' });
      return;
    }

    res.setHeader('Cache-Control', 's-maxage=0, stale-while-revalidate=0');
    res.status(200).json({ url: backendUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
}
