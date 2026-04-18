const TURSO_URL = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

/**
 * Modern Turso Client using global fetch (undici)
 */
class TursoClient {
    constructor(url, token) {
        this.url = url.replace('libsql://', 'https://');
        this.token = token;
        this.baseUrl = this.url.endsWith('/') ? this.url.slice(0, -1) : this.url;
    }

    async execute(stmt) {
        const sql = typeof stmt === 'string' ? stmt : stmt.sql;
        const args = stmt.args || [];
        
        // format args
        const formattedArgs = args.map(arg => {
            if (arg === null) return { type: 'null', value: null };
            if (typeof arg === 'number') return { type: 'integer', value: arg.toString() };
            return { type: 'text', value: arg.toString() };
        });

        try {
            const res = await fetch(`${this.baseUrl}/v2/pipeline`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    requests: [
                        { type: 'execute', stmt: { sql, args: formattedArgs } },
                        { type: 'close' }
                    ]
                })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.message || `Turso error ${res.status}`);
            }

            const data = await res.json();
            const result = data.results?.[0]?.response?.result;
            if (!result) return { rows: [] };

            // map rows
            const columns = result.cols.map(c => c.name);
            const rows = result.rows.map(row => {
                const obj = {};
                row.forEach((val, i) => {
                    obj[columns[i]] = val.value;
                });
                return obj;
            });

            return { rows };
        } catch (err) {
            console.error('[Turso Error]', err.message);
            throw err;
        }
    }
}

const db = TURSO_URL && TURSO_TOKEN ? new TursoClient(TURSO_URL, TURSO_TOKEN) : null;

if (db) {
    (async () => {
        try {
            await db.execute(`
                CREATE TABLE IF NOT EXISTS remix_history (
                  id TEXT PRIMARY KEY,
                  name TEXT NOT NULL,
                  stems JSON NOT NULL,
                  chords JSON NOT NULL,
                  beats JSON NOT NULL,
                  tempo INTEGER,
                  engine TEXT,
                  created_at INTEGER NOT NULL
                )
            `);
            await db.execute(`
                CREATE TABLE IF NOT EXISTS cookies (
                  type TEXT PRIMARY KEY,
                  content TEXT NOT NULL,
                  updated_at INTEGER NOT NULL
                )
            `);
            await db.execute(`
                CREATE TABLE IF NOT EXISTS configs (
                  key TEXT PRIMARY KEY,
                  value TEXT NOT NULL,
                  updated_at INTEGER NOT NULL
                )
            `);
            console.log("✅ Turso: tables ready");
        } catch (err) {
            console.warn("⚠️ Turso initialization skipped");
        }
    })();
}

module.exports = db;
