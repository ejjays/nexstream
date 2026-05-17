import db from "../../utils/db.util.js";
import { SpotifyMetadata } from "../../types/index.js";

interface RawMapping {
  url: string;
  title: string;
  artist: string;
  album: string;
  imageUrl: string;
  duration: number;
  isrc: string;
  previewUrl: string;
  youtubeUrl: string;
  formats: string;
  audioFormats: string;
  audioFeatures: string;
  year: string;
  timestamp: number;
}

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
      await db.execute('CREATE INDEX IF NOT EXISTS idx_spotify_isrc ON spotify_mappings(isrc)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_spotify_youtube ON spotify_mappings(youtubeUrl)');
      console.log("[Turso] Database initialized.");
    } catch (err: unknown) {
      const error = err as Error;
      console.error("[Turso] Database bootstrap failed:", error.message);
    }
  })();
}

export function saveToBrain(spotifyUrl: string, data: SpotifyMetadata): void {
  const activeDb = db;
  if (!activeDb) return;
  
  const isrc = data.isrc && data.isrc !== 'NONE' ? data.isrc : null;
  const isIsrcMatch = data.isIsrcMatch === true || (data.isrc && data.isrc !== 'NONE');

  if (!isIsrcMatch || !isrc) {
    return;
  }

  process.nextTick(() => {
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
        data.targetUrl || data.target_url || null,
        JSON.stringify(data.formats || []),
        JSON.stringify(data.audioFormats || []),
        JSON.stringify(data.audioFeatures || null),
        data.year || "Unknown",
        Date.now(),
      ];

      activeDb.execute({
        sql: "INSERT OR REPLACE INTO spotify_mappings " +
                    "(url, title, artist, album, imageUrl, duration, isrc, previewUrl, youtubeUrl, formats, audioFormats, audioFeatures, year, timestamp) " +
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args,
      }).catch((err: unknown) => {
        const error = err as Error;
        console.warn("[Turso] Failed to save to database:", error.message);
      });

      if (data.previewUrl && (data.previewUrl.includes('scdn.co') || data.previewUrl.includes('dzcdn.net') || data.previewUrl.includes('itunes.apple.com'))) {
        activeDb.execute({
          sql: "INSERT OR REPLACE INTO volatile_links (url, expires_at, provider) VALUES (?, ?, ?)",
          args: [cleanUrl, Date.now() + 55 * 60 * 1000, "spotify_preview"]
        }).catch((err) => {
           console.debug('[Turso] Volatile link save failed:', (err as Error).message);
        });
      }
    } catch (err: unknown) {
      console.warn("[Turso] Synchronous error preparing database save:", (err as Error).message);
    }
  });
}

export async function getFromBrain(cleanUrl: string): Promise<RawMapping | null> {
  if (!db) return null;
  try {
    const result = await db.execute<RawMapping>({
      sql: "SELECT * FROM spotify_mappings WHERE url = ?",
      args: [cleanUrl],
    });
    return result.rows?.[0] || null;
  } catch (_err) {
    return null;
  }
}

export async function updatePreviewInBrain(cleanUrl: string, previewUrl: string): Promise<void> {
  const activeDb = db;
  if (!activeDb) return;
  try {
    await activeDb.execute({
      sql: "UPDATE spotify_mappings SET previewUrl = ? WHERE url = ?",
      args: [previewUrl, cleanUrl],
    });
    
    if (previewUrl && (previewUrl.includes('scdn.co') || previewUrl.includes('dzcdn.net') || previewUrl.includes('itunes.apple.com'))) {
      await activeDb.execute({
        sql: "INSERT OR REPLACE INTO volatile_links (url, expires_at, provider) VALUES (?, ?, ?)",
        args: [cleanUrl, Date.now() + 55 * 60 * 1000, "spotify_preview"]
      });
    }
  } catch (err: unknown) {
    const error = err as Error;
    console.warn("[Turso] Failed to update preview in database:", error.message);
  }
}

if (db) {
  const activeDb = db;
  setInterval(() => {
    (async () => {
      try {
        const threshold = Date.now() + 5 * 60 * 1000;
        const result = await activeDb.execute<{ url: string; provider: string; expires_at: number }>({
          sql: "SELECT url, provider FROM volatile_links WHERE expires_at < ?",
          args: [threshold]
        });
        
        if (result.rows && result.rows.length > 0) {
          console.log('[JIT Worker] Found ' + result.rows.length + ' volatile links expiring soon. Refreshing...');
          const { refreshPreviewIfNeeded } = await import('./index.js');
          for (const row of result.rows) {
            if (row.provider === "spotify_preview") {
              const brainData = await getFromBrain(row.url);
              if (brainData) {
                 await refreshPreviewIfNeeded(row.url, brainData as unknown as SpotifyMetadata);
              }
            }
          }
        }
      } catch (err: unknown) {
        console.warn("[JIT Worker] Error scanning volatile_links:", (err as Error).message);
      }
    })();
  }, 60000).unref();
}
