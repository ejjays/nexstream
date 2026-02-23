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
      await db.execute(`
                CREATE TABLE IF NOT EXISTS spotify_mappings (
                    url TEXT PRIMARY KEY,
                    title TEXT,
                    artist TEXT,
                    album TEXT,
                    imageUrl TEXT,
                    duration INTEGER,
                    isrc TEXT,
                    previewUrl TEXT,
                    youtubeUrl TEXT,
                    formats TEXT,
                    audioFormats TEXT,
                    audioFeatures TEXT,
                    year TEXT,
                    timestamp INTEGER
                )
            `);
      console.log("[Turso] Database initialized.");
    } catch (err) {
      console.error("[Turso] Database bootstrap failed:", err.message);
    }
  })();
}

async function saveToBrain(spotifyUrl, data) {
  if (!db) return;
  try {
    const cleanUrl = spotifyUrl.split("?")[0];
    const args = [
      cleanUrl,
      data.title || "Unknown Title",
      data.artist || "Unknown Artist",
      data.album || "",
      data.imageUrl || data.cover || data.thumbnail || null,
      data.duration || 0,
      data.isrc || null,
      data.previewUrl || null,
      data.targetUrl || data.youtubeUrl || null,
      JSON.stringify(data.formats || []),
      JSON.stringify(data.audioFormats || []),
      JSON.stringify(data.audioFeatures || null),
      data.year || "Unknown",
      Date.now(),
    ];

    await db.execute({
      sql: `INSERT OR REPLACE INTO spotify_mappings 
                  (url, title, artist, album, imageUrl, duration, isrc, previewUrl, youtubeUrl, formats, audioFormats, audioFeatures, year, timestamp)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: args,
    });
    console.log(`[Turso] Mapped: "${data.title}"`);
  } catch (err) {
    console.warn("[Turso] Failed to save to database:", err.message);
  }
}

async function getFromBrain(cleanUrl) {
  if (!db) return null;
  try {
    const result = await db.execute({
      sql: "SELECT * FROM spotify_mappings WHERE url = ?",
      args: [cleanUrl],
    });
    return result.rows?.[0] || null;
  } catch (err) {
    return null;
  }
}

module.exports = {
  saveToBrain,
  getFromBrain,
  db,
};
