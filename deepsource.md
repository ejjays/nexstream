# DeepSource Code Review Report

**Repository:** ejjays/nexstream
**Branch:** `main`
**Commit:** 4e8c3af...1255e01
**Run:** [https://app.deepsource.com/gh/ejjays/nexstream/run/aad7bbbc-168e-4475-b849-f13a2eeee05f/](https://app.deepsource.com/gh/ejjays/nexstream/run/aad7bbbc-168e-4475-b849-f13a2eeee05f/)

---

## Summary
- **Python:** No issues detected- **Docker:** No issues detected- **Shell:** No issues detected- **JavaScript:** 3 issues

---

## Code Review Findings
### Python
**Status:** Success
**Findings:** No new issues detected
### Docker
**Status:** Success
**Findings:** No new issues detected
### Shell
**Status:** Success
**Findings:** No new issues detected
### JavaScript
**Status:** Failure
**Findings:** 1 new issue

1. **Type literal only has a call signature, you should use a function type instead** (`JS-0362`)
   **File:** `backend/src/services/extract.service.ts`
   **Line:** 63
   ```typescript
   }>
           };
   
           const genAIInstance = new (GoogleGenAI as unknown as { new(key: string): { getGenerativeModel: GetModelFn } })(apiKey);
           
           let prompt = `Act as an expert music transcriber. Your task is to merge raw audio-extracted chords with synchronized lyrics to create a highly accurate Ultimate-Guitar style chord sheet.\n\nSong: "${title}" by "${artist}"\n\n`;
   ```
   **Category:** Anti-pattern
   **Severity:** minor

2. **Unexpected any. Specify a different type** (`JS-0323`)
   **File:** `backend/src/services/spotify/metadata.ts`
   **Line:** 282
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

3. **Unexpected any. Specify a different type** (`JS-0323`)
   **File:** `backend/src/services/spotify/metadata.ts`
   **Line:** 243
   ```typescript
   return mapScraperToMetadata(trackId, details);
   }
   
   function finalizeMetadata(metadata: SpotifyMetadata, onProgress: any, soundchartsPromise: Promise<SpotifyMetadata | null> | null = null) {
     metadata.cover = metadata.imageUrl;
     metadata.thumbnail = metadata.imageUrl || "";
   ```
   **Category:** Anti-pattern
   **Severity:** critical

