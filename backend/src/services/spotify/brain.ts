// @ts-ignore
import db from "../../utils/db.util.js";

if (db) {
  (async () => {
    try {
      await (db as any).execute(`
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
    } catch (err: any) {
      console.error("[Turso] Database bootstrap failed:", err.message);
    }
  })();
}

export async function saveToBrain(spotifyUrl: string, data: any): Promise<void> {
  if (!db) return;
  
  const isrc = data.isrc && data.isrc !== 'NONE' ? data.isrc : null;
  const isIsrcMatch = data.isIsrcMatch === true || (data.isrc && data.isrc !== 'NONE');

  if (!isIsrcMatch || !isrc) {
    return;
  }

  try {
    const cleanUrl = spotifyUrl.split("?")[0];
    const args = [
      cleanUrl,
      data.title || "Unknown Title",
      data.artist || "Unknown Artist",
      data.album || "",
      data.imageUrl || data.cover || data.thumbnail || null,
      data.duration || 0,
      isrc,
      data.previewUrl || null,
      data.targetUrl || data.target_url || data.youtubeUrl || null,
      JSON.stringify(data.formats || []),
      JSON.stringify(data.audioFormats || []),
      JSON.stringify(data.audioFeatures || null),
      data.year || "Unknown",
      Date.now(),
    ];

    await (db as any).execute({
      sql: `INSERT OR REPLACE INTO spotify_mappings 
                  (url, title, artist, album, imageUrl, duration, isrc, previewUrl, youtubeUrl, formats, audioFormats, audioFeatures, year, timestamp)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: args,
    });
  } catch (err: any) {
    console.warn("[Turso] Failed to save to database:", err.message);
  }
}

export async function getFromBrain(cleanUrl: string): Promise<any> {
  if (!db) return null;
  try {
    const result = await (db as any).execute({
      sql: "SELECT * FROM spotify_mappings WHERE url = ?",
      args: [cleanUrl],
    });
    return result.rows?.[0] || null;
  } catch (err) {
    return null;
  }
}

export async function updatePreviewInBrain(cleanUrl: string, previewUrl: string): Promise<void> {
  if (!db) return;
  try {
    await (db as any).execute({
      sql: `UPDATE spotify_mappings SET previewUrl = ? WHERE url = ?`,
      args: [previewUrl, cleanUrl],
    });
  } catch (err: any) {
    console.warn("[Turso] Failed to update preview in database:", err.message);
  }
}
