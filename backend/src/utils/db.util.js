const { createClient } = require("@libsql/client/http");

const TURSO_URL = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

const db =
  TURSO_URL && TURSO_TOKEN
    ? createClient({
        url: TURSO_URL,
        authToken: TURSO_TOKEN,
      })
    : null;

if (db) {
  (async () => {
    try {
      // Table for practice sessions
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
      console.log('✅ Turso: remix_history table ready');
    } catch (err) {
      console.error('❌ Turso initialization error:', err.message);
    }
  })();
}

module.exports = db;
