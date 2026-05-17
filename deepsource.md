# DeepSource Code Review Report

**Repository:** ejjays/nexstream
**Branch:** `main`
**Commit:** 8fcab50...4e8c3af
**Run:** [https://app.deepsource.com/gh/ejjays/nexstream/run/8747e91d-dec2-4b6d-9e37-a33ebce321ca/](https://app.deepsource.com/gh/ejjays/nexstream/run/8747e91d-dec2-4b6d-9e37-a33ebce321ca/)

---

## Summary
- **Shell:** No issues detected- **Docker:** No issues detected- **Python:** 14 issues- **JavaScript:** 31 issues

---

## Code Review Findings
### Shell
**Status:** Success
**Findings:** No new issues detected
### Docker
**Status:** Success
**Findings:** No new issues detected
### Python
**Status:** Failure
**Findings:** 14 new issues

1. **`analyze_file` has a cyclomatic complexity of 16 with "high" risk** (`PY-R1000`)
   **File:** `analyze_js0129.py`
   **Line:** 4
   ```python
   import os
   import re
   
   def analyze_file(filepath):
       with open(filepath, 'r') as f:
           lines = f.readlines()
   ```
   **Category:** Anti-pattern
   **Severity:** minor

2. **External variable 'filepath' used in file path** (`PTC-W6004`)
   **File:** `analyze_js0129.py`
   **Line:** 5
   ```python
   import re
   
   def analyze_file(filepath):
       with open(filepath, 'r') as f:
           lines = f.readlines()
   
       # Simple regex to find definitions
   ```
   **Category:** Security
   **Severity:** minor

3. **Redefining name 'findings' from outer scope** (`PYL-W0621`)
   **File:** `analyze_js0129.py`
   **Line:** 33
   ```python
   if name not in definitions:
                   definitions[name] = line_num
   
       findings = []
       for i, line in enumerate(lines):
           line_num = i + 1
           line = line.split('//')[0]
   ```
   **Category:** Anti-pattern
   **Severity:** major

4. **Redefining name 'name' from outer scope** (`PYL-W0621`)
   **File:** `analyze_js0129.py`
   **Line:** 23
   ```python
   m_func = func_def_re.search(line)
           if m_func:
               name = m_func.group(1)
               if name not in definitions:
                   definitions[name] = line_num
   ```
   **Category:** Anti-pattern
   **Severity:** major

5. **Redefining name 'def_line' from outer scope** (`PYL-W0621`)
   **File:** `analyze_js0129.py`
   **Line:** 39
   ```python
   line = line.split('//')[0]
           
           # Look for usages of defined names
           for name, def_line in definitions.items():
               if line_num < def_line:
                   # Regex for usage: name not preceded or followed by alphanumeric/_
                   # and not part of a definition itself
   ```
   **Category:** Anti-pattern
   **Severity:** major

6. **External variable 'filepath' used in file path** (`PTC-W6004`)
   **File:** `analyze_js0129_v2.py`
   **Line:** 5
   ```python
   import re
   
   def analyze_file(filepath):
       with open(filepath, 'r') as f:
           lines = f.readlines()
   
       # Simple regex to find definitions
   ```
   **Category:** Security
   **Severity:** minor

7. **`analyze_file` has a cyclomatic complexity of 19 with "high" risk** (`PY-R1000`)
   **File:** `analyze_js0129_v2.py`
   **Line:** 4
   ```python
   import os
   import re
   
   def analyze_file(filepath):
       with open(filepath, 'r') as f:
           lines = f.readlines()
   ```
   **Category:** Anti-pattern
   **Severity:** minor

8. **Redefining name 'findings' from outer scope** (`PYL-W0621`)
   **File:** `analyze_js0129_v2.py`
   **Line:** 37
   ```python
   if name not in definitions:
                   definitions[name] = line_num
   
       findings = []
       for i, line in enumerate(lines):
           line_num = i + 1
           line = line.split('//')[0]
   ```
   **Category:** Anti-pattern
   **Severity:** major

9. **Redefining name 'def_line' from outer scope** (`PYL-W0621`)
   **File:** `analyze_js0129_v2.py`
   **Line:** 46
   ```python
   continue
   
           # Look for usages of defined names
           for name, def_line in definitions.items():
               if line_num < def_line:
                   # Regex for usage: name not preceded or followed by alphanumeric/_
                   # and not part of a definition itself
   ```
   **Category:** Anti-pattern
   **Severity:** major

10. **Redefining name 'name' from outer scope** (`PYL-W0621`)
    **File:** `analyze_js0129_v2.py`
    **Line:** 27
    ```python
    m_func = func_def_re.search(line)
            if m_func:
                name = m_func.group(1)
                if name not in definitions:
                    definitions[name] = line_num
    ```
    **Category:** Anti-pattern
    **Severity:** major

11. **External variable 'filepath' used in file path** (`PTC-W6004`)
    **File:** `analyze_js0129_v3.py`
    **Line:** 5
    ```python
    import re
    
    def analyze_file(filepath):
        with open(filepath, 'r') as f:
            content = f.read()
        
        lines = content.splitlines()
    ```
    **Category:** Security
    **Severity:** minor

12. **Redefining name 'name' from outer scope** (`PYL-W0621`)
    **File:** `analyze_js0129_v3.py`
    **Line:** 28
    ```python
    all_decls = func_decls + var_decls
        findings = []
        
        for name, def_line in all_decls:
            # Search for usages before def_line
            for i in range(def_line - 1):
                line = lines[i]
    ```
    **Category:** Anti-pattern
    **Severity:** major

13. **Redefining name 'def_line' from outer scope** (`PYL-W0621`)
    **File:** `analyze_js0129_v3.py`
    **Line:** 28
    ```python
    all_decls = func_decls + var_decls
        findings = []
        
        for name, def_line in all_decls:
            # Search for usages before def_line
            for i in range(def_line - 1):
                line = lines[i]
    ```
    **Category:** Anti-pattern
    **Severity:** major

14. **Redefining name 'findings' from outer scope** (`PYL-W0621`)
    **File:** `analyze_js0129_v3.py`
    **Line:** 26
    ```python
    var_decls.append((m.group(1), i + 1))
                
        all_decls = func_decls + var_decls
        findings = []
        
        for name, def_line in all_decls:
            # Search for usages before def_line
    ```
    **Category:** Anti-pattern
    **Severity:** major
### JavaScript
**Status:** Failure
**Findings:** 6 new issues

1. **Variable name is too small** (`JS-C1002`)
   **File:** `backend/src/services/extract.service.ts`
   **Line:** 69
   ```typescript
   const fetchSearch = async (t: string): Promise<LyricsData | null> => {
           try {
               const q = encodeURIComponent(`${artist} ${t}`);
               const url = `https://lrclib.net/api/search?q=${q}`;
               const res = await fetch(url);
               if (!res.ok) return null;
   ```
   **Category:** Anti-pattern
   **Severity:** minor

2. **use `Boolean(chordsSheet)` instead** (`JS-0066`)
   **File:** `backend/src/services/extract.service.ts`
   **Line:** 166
   ```typescript
   }
   
       let chordsSheet = await getUgChords(artist, title, plainLyrics, keyHint);
       let usedGrounding = !!chordsSheet;
   
       if (!chordsSheet) {
           const validChords = engineChords
   ```
   **Category:** Anti-pattern
   **Severity:** minor

3. **'usedGrounding' is never reassigned. Use 'const' instead** (`JS-0242`)
   **File:** `backend/src/services/extract.service.ts`
   **Line:** 166
   ```typescript
   }
   
       let chordsSheet = await getUgChords(artist, title, plainLyrics, keyHint);
       let usedGrounding = !!chordsSheet;
   
       if (!chordsSheet) {
           const validChords = engineChords
   ```
   **Category:** Anti-pattern
   **Severity:** minor

4. **Unexpected string concatenation** (`JS-0246`)
   **File:** `backend/src/services/extract.service.ts`
   **Line:** 176
   ```typescript
   const cleanTitle = title.split('(')[0].trim();
       const ugLink = `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(
           artist + " " + cleanTitle
       )}`;
       
       return {
   ```
   **Category:** Anti-pattern
   **Severity:** minor

5. **Expected to return a value at the end of async arrow function** (`JS-0045`)
   **File:** `backend/src/services/extract.service.ts`
   **Line:** 216
   ```typescript
   engineChords: Array<{ chord: string; is_passing: boolean }> = []
   ): Promise<SongData> {
       return new Promise((resolve, reject) => {
           fpcalc(filePath, async (err: Error | null, result: { fingerprint: string; duration: number } | undefined) => {
               if (err || !result) {
                   try {
                       const fallbackResult = await fallbackToShazam(filePath, engineChords);
   ```
   **Category:** Anti-pattern
   **Severity:** minor

6. **Prefer using an optional chain expression instead, as it's more concise and easier to read** (`JS-W1044`)
   **File:** `backend/src/services/extract.service.ts`
   **Line:** 197
   ```typescript
   try {
           const shazam = new Shazam();
           const res = await shazam.recognise(filePath, 'en-US') as { track?: { subtitle: string; title: string; isrc: string } };
           if (res && res.track) {
               const track = res.track;
               const artist = track.subtitle;
               const title = track.title;
   ```
   **Category:** Anti-pattern
   **Severity:** minor

7. **Found `async` function without any `await` expressions** (`JS-0116`)
   **File:** `backend/src/services/extract.service.ts`
   **Line:** 211-290
   ```typescript
   }
   }
   
   export async function extractSongData(
       filePath: string,
       engineChords: Array<{ chord: string; is_passing: boolean }> = []
   ): Promise<SongData> {
       return new Promise((resolve, reject) => {
           fpcalc(filePath, async (err: Error | null, result: { fingerprint: string; duration: number } | undefined) => {
               if (err || !result) {
                   try {
                       const fallbackResult = await fallbackToShazam(filePath, engineChords);
                       return resolve(fallbackResult);
                   } catch (fallbackErr) {
                       return reject(fallbackErr);
                   }
               }
               const acoustidUrl = `https://api.acoustid.org/v2/lookup?client=${ACOUSTID_API_KEY}&meta=recordingids&fingerprint=${result.fingerprint}&duration=${result.duration}`;
               try {
                   const response = await fetch(acoustidUrl);
                   const rawAcoustidData = await response.json();
                   const parsedAcoustid = AcoustidResponseSchema.safeParse(rawAcoustidData);
                   if (!parsedAcoustid.success) {
                       console.debug('[ExtractService] Acoustid validation failed:', parsedAcoustid.error.message);
                       const fallbackResult = await fallbackToShazam(filePath, engineChords);
                       return resolve(fallbackResult);
                   }
                   const data = parsedAcoustid.data;
                   const recording = data.results?.[0]?.recordings?.[0];
                                   if (!recording) {
                       const fallbackResult = await fallbackToShazam(filePath, engineChords);
                       return resolve(fallbackResult);
                   }
                   const mbid = recording.id;
                   const mbUrl = `https://musicbrainz.org/ws/2/recording/${mbid}?inc=isrcs&fmt=json`;
                   const mbRes = await fetch(mbUrl, { headers: { 'User-Agent': 'ISRC_Finder/1.0' } });
                   const rawMbData = await mbRes.json();
                   const parsedMb = MusicBrainzResponseSchema.safeParse(rawMbData);
                   if (!parsedMb.success) {
                        console.debug('[ExtractService] MusicBrainz validation failed:', parsedMb.error.message);
                        const fallbackResult = await fallbackToShazam(filePath, engineChords);
                        return resolve(fallbackResult);
                   }
                   const mbData = parsedMb.data;
                   const isrc = mbData.isrcs?.[0];
                   if (!isrc) {
                        const fallbackResult = await fallbackToShazam(filePath, engineChords);
                        return resolve(fallbackResult);
                    }
                   const deezerRes = await fetch(`https://api.deezer.com/track/isrc:${isrc}`);
                   const rawDeezerData = await deezerRes.json();
                   const parsedDeezer = DeezerResponseSchema.safeParse(rawDeezerData);
                   if (!parsedDeezer.success) {
                       console.debug('[ExtractService] Deezer validation failed:', parsedDeezer.error.message);
                       const fallbackResult = await fallbackToShazam(filePath, engineChords);
                       return resolve(fallbackResult);
                   }
                   const deezerData = parsedDeezer.data;
                   if (deezerData.error || !deezerData.artist || !deezerData.title) {
                       const fallbackResult = await fallbackToShazam(filePath, engineChords);
                       return resolve(fallbackResult);
                   }
                   const finalResult = await processSong(deezerData.artist.name, deezerData.title, isrc, engineChords);
                   resolve(finalResult);
               } catch (_error) {
                   try {
                       const fallbackResult = await fallbackToShazam(filePath, engineChords);
                       resolve(fallbackResult);
                   } catch (fallbackErr) {
                       reject(fallbackErr);
                   }
               }
           });
       });
   }
   ```
   **Category:** Bug risk
   **Severity:** minor

8. **Type literal only has a call signature, you should use a function type instead** (`JS-0362`)
   **File:** `backend/src/services/extract.service.ts`
   **Line:** 115
   ```typescript
   }>
           };
   
           const genAIInstance = new (GoogleGenAI as unknown as { new(key: string): { getGenerativeModel: GetModelFn } })(apiKey);
           
           let prompt = `Act as an expert music transcriber. Your task is to merge raw audio-extracted chords with synchronized lyrics to create a highly accurate Ultimate-Guitar style chord sheet.\n\nSong: "${title}" by "${artist}"\n\n`;
   ```
   **Category:** Anti-pattern
   **Severity:** minor

9. **`mapScraperToMetadata` has a cyclomatic complexity of 31 with "very-high" risk** (`JS-R1005`)
   **File:** `backend/src/services/spotify/metadata.ts`
   **Line:** 141
   ```typescript
   return details;
   }
   
   function mapScraperToMetadata(trackId: string, details: any): SpotifyMetadata {
     return {
       id: trackId,
       title: details.name || details.preview?.title || details.title || "Unknown Title",
   ```
   **Category:** Anti-pattern
   **Severity:** minor

10. **Variable name is too small** (`JS-C1002`)
    **File:** `backend/src/services/spotify/metadata.ts`
    **Line:** 263
    ```typescript
    },
        });
        const data = await response.text();
        const $ = load(data);
        const scriptContent = $('script[id="resource"]').html();
        if (scriptContent) {
          const json = JSON.parse(decodeURIComponent(scriptContent));
    ```
    **Category:** Anti-pattern
    **Severity:** minor

11. **Variable name is too small** (`JS-C1002`)
    **File:** `backend/src/services/spotify/metadata.ts`
    **Line:** 235
    ```typescript
    },
        });
        const data = await response.text();
        const $ = load(data);
        return { cover: $('meta[property="og:image"]').attr("content") };
      } catch (_e) {
        return null;
    ```
    **Category:** Anti-pattern
    **Severity:** minor

12. **Unexpected any. Specify a different type** (`JS-0323`)
    **File:** `backend/src/services/spotify/metadata.ts`
    **Line:** 112
    ```typescript
    let details: any = null;
      try {
        details = await getData(safeUrl);
      } catch (error: any) {
        console.debug('[SpotifyMetadata] Scraper getData error:', error.message);
      }
      if (!details) {
    ```
    **Category:** Anti-pattern
    **Severity:** critical

13. **Unexpected any. Specify a different type** (`JS-0323`)
    **File:** `backend/src/services/spotify/metadata.ts`
    **Line:** 86
    ```typescript
    clearTimeout(timeout);
    
        if (!response.ok) return null;
        const data = (await response.json()) as any;
        if (!data?.object) return null;
    
        const obj = data.object;
    ```
    **Category:** Anti-pattern
    **Severity:** critical

14. **Unexpected any. Specify a different type** (`JS-0323`)
    **File:** `backend/src/services/spotify/metadata.ts`
    **Line:** 167
    ```typescript
    return mapScraperToMetadata(trackId, details);
    }
    
    function finalizeMetadata(metadata: SpotifyMetadata, onProgress: any, soundchartsPromise: Promise<SpotifyMetadata | null> | null = null) {
      metadata.cover = metadata.imageUrl;
      metadata.thumbnail = metadata.imageUrl || "";
    ```
    **Category:** Anti-pattern
    **Severity:** critical

15. **Unexpected any. Specify a different type** (`JS-0323`)
    **File:** `backend/src/services/spotify/metadata.ts`
    **Line:** 58
    ```typescript
    previewUrl: track.preview_url || undefined,
          source: "spotify_api",
        };
      } catch (err: any) {
        console.error(`[Spotify-API] Error: ${err.message}`);
        return null;
      }
    ```
    **Category:** Anti-pattern
    **Severity:** critical

16. **Unexpected any. Specify a different type** (`JS-0323`)
    **File:** `backend/src/services/spotify/metadata.ts`
    **Line:** 127
    ```typescript
    const oembedRes = await fetch(
            `https://open.spotify.com/oembed?url=${encodeURIComponent(safeUrl)}`,
          );
          const oembedData = (await oembedRes.json()) as any;
          if (oembedData) {
            details = {
              name: oembedData.title,
    ```
    **Category:** Anti-pattern
    **Severity:** critical

17. **Unexpected any. Specify a different type** (`JS-0323`)
    **File:** `backend/src/services/spotify/metadata.ts`
    **Line:** 248
    ```typescript
    if (res?.cover) {
          metadata.imageUrl = res.cover;
        }
      } catch (e: any) {
        console.debug('[SpotifyMetadata] Side tasks error:', e.message);
      }
    }
    ```
    **Category:** Anti-pattern
    **Severity:** critical

18. **Unexpected any. Specify a different type** (`JS-0323`)
    **File:** `backend/src/services/spotify/metadata.ts`
    **Line:** 134
    ```typescript
    artists: [{ name: "Unknown Artist" }],
            };
          }
        } catch (error: any) {
          console.debug('[SpotifyMetadata] Scraper oembed fetch error:', error.message);
        }
      }
    ```
    **Category:** Anti-pattern
    **Severity:** critical

19. **Unexpected any. Specify a different type** (`JS-0323`)
    **File:** `backend/src/services/spotify/metadata.ts`
    **Line:** 242
    ```typescript
    }
    }
    
    export async function resolveSideTasks(videoURL: string, metadata: any): Promise<void> {
      try {
        const res = await fetchSpotifyPageData(videoURL);
        if (res?.cover) {
    ```
    **Category:** Anti-pattern
    **Severity:** critical

20. **Unexpected any. Specify a different type** (`JS-0323`)
    **File:** `backend/src/services/spotify/metadata.ts`
    **Line:** 41
    ```typescript
    if (afRes.ok) {
            audioFeatures = await afRes.json();
          }
        } catch (e: any) {
          console.debug('[SpotifyMetadata] Audio features error:', e.message);
        }
    ```
    **Category:** Anti-pattern
    **Severity:** critical

21. **Unexpected any. Specify a different type** (`JS-0323`)
    **File:** `backend/src/services/spotify/metadata.ts`
    **Line:** 108
    ```typescript
    }
    }
    
    async function getScraperDetails(safeUrl: string): Promise<any> {
      let details: any = null;
      try {
        details = await getData(safeUrl);
    ```
    **Category:** Anti-pattern
    **Severity:** critical

22. **Unexpected any. Specify a different type** (`JS-0323`)
    **File:** `backend/src/services/spotify/metadata.ts`
    **Line:** 141
    ```typescript
    return details;
    }
    
    function mapScraperToMetadata(trackId: string, details: any): SpotifyMetadata {
      return {
        id: trackId,
        title: details.name || details.preview?.title || details.title || "Unknown Title",
    ```
    **Category:** Anti-pattern
    **Severity:** critical

23. **Unexpected any. Specify a different type** (`JS-0323`)
    **File:** `backend/src/services/spotify/metadata.ts`
    **Line:** 118
    ```typescript
    if (!details) {
        try {
          details = await getDetails(safeUrl);
        } catch (error: any) {
          console.debug('[SpotifyMetadata] Scraper getDetails error:', error.message);
        }
      }
    ```
    **Category:** Anti-pattern
    **Severity:** critical

24. **Unexpected any. Specify a different type** (`JS-0323`)
    **File:** `backend/src/services/spotify/metadata.ts`
    **Line:** 33
    ```typescript
    if (!response.ok) return null;
        const track = (await response.json()) as any;
    
        let audioFeatures: any = null;
        try {
          const afRes = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
            headers: { Authorization: `Bearer ${token}` }
    ```
    **Category:** Anti-pattern
    **Severity:** critical

25. **Unexpected any. Specify a different type** (`JS-0323`)
    **File:** `backend/src/services/spotify/metadata.ts`
    **Line:** 109
    ```typescript
    }
    
    async function getScraperDetails(safeUrl: string): Promise<any> {
      let details: any = null;
      try {
        details = await getData(safeUrl);
      } catch (error: any) {
    ```
    **Category:** Anti-pattern
    **Severity:** critical

26. **Unexpected any. Specify a different type** (`JS-0323`)
    **File:** `backend/src/services/spotify/metadata.ts`
    **Line:** 31
    ```typescript
    });
    
        if (!response.ok) return null;
        const track = (await response.json()) as any;
    
        let audioFeatures: any = null;
        try {
    ```
    **Category:** Anti-pattern
    **Severity:** critical

27. **Unexpected any. Specify a different type** (`JS-0323`)
    **File:** `backend/src/services/spotify/metadata.ts`
    **Line:** 206
    ```typescript
    const scrapersPromise = fetchFromScrapers(videoURL).catch(() => null);
      const odesliPromise = fetchFromOdesli(videoURL).catch(() => null);
    
      const firstMetadata: any = await Promise.any([
        soundchartsPromise.then((res) => res || Promise.reject(new Error("No Soundcharts"))),
        scrapersPromise.then((res) => res || Promise.reject(new Error("No Scrapers"))),
        odesliPromise.then((res) => res || Promise.reject(new Error("No Odesli"))),
    ```
    **Category:** Anti-pattern
    **Severity:** critical

28. **Found `async` function without any `await` expressions** (`JS-0116`)
    **File:** `backend/src/utils/cookie.util.ts`
    **Line:** 24-55
    ```typescript
    }
    }
    
    async function downloadCookiesBackground(type: string, cookieUrl: string, cookiesPath: string): Promise<string | null> {
      return new Promise((resolve) => {
        https
          .get(cookieUrl, (response) => {
            if (response.statusCode !== 200) {
              return resolve(isValidCookieFile(cookiesPath) ? cookiesPath : null);
            }
            let data = "";
            response.on("data", (chunk) => (data += chunk));
            response.on("end", () => {
              if (data.includes("# Netscape") || data.includes("HttpOnly_")) {
                fs.writeFileSync(cookiesPath, data);
                cookieCache.set(type, Date.now());
                if (db) {
                  (db as unknown as { execute: (options: { sql: string; args: unknown[] }) => Promise<void> }).execute({
                    sql: "INSERT OR REPLACE INTO cookies (type, content, updated_at) VALUES (?, ?, ?)",
                    args: [type, data, Date.now()]
                  }).catch(() => {});
                }
                console.log(`[Cookies] ${type} cookies synced`);
                resolve(cookiesPath);
              } else {
                resolve(isValidCookieFile(cookiesPath) ? cookiesPath : null);
              }
            });
          })
          .on("error", () => {
            resolve(isValidCookieFile(cookiesPath) ? cookiesPath : null);
          });
      });
    }
    
    export async function downloadCookies(
    type: string = "youtube"): Promise<string | null> {
    ```
    **Category:** Bug risk
    **Severity:** minor

29. **Unexpected empty arrow function** (`JS-0321`)
    **File:** `backend/src/utils/cookie.util.ts`
    **Line:** 42
    ```typescript
    (db as unknown as { execute: (options: { sql: string; args: unknown[] }) => Promise<void> }).execute({
                    sql: "INSERT OR REPLACE INTO cookies (type, content, updated_at) VALUES (?, ?, ?)",
                    args: [type, data, Date.now()]
                  }).catch(() => {});
                }
                console.log(`[Cookies] ${type} cookies synced`);
                resolve(cookiesPath);
    ```
    **Category:** Anti-pattern
    **Severity:** minor

30. **Expected to return a value at the end of arrow function** (`JS-0045`)
    **File:** `backend/src/utils/cookie.util.ts`
    **Line:** 27
    ```typescript
    async function downloadCookiesBackground(type: string, cookieUrl: string, cookiesPath: string): Promise<string | null> {
      return new Promise((resolve) => {
        https
          .get(cookieUrl, (response) => {
            if (response.statusCode !== 200) {
              return resolve(isValidCookieFile(cookiesPath) ? cookiesPath : null);
            }
    ```
    **Category:** Anti-pattern
    **Severity:** minor

31. **Type string trivially inferred from a string literal, remove type annotation** (`JS-0331`)
    **File:** `backend/src/utils/cookie.util.ts`
    **Line:** 58
    ```typescript
    }
    
    export async function downloadCookies(
    type: string = "youtube"): Promise<string | null> {
      const isMeta = type === "facebook" || type === "instagram";
      const envKey = isMeta ? "FB_COOKIES_URL" : "COOKIES_URL";
      const cookieUrl = process.env[envKey];
    ```
    **Category:** Anti-pattern
    **Severity:** major

