import { GoogleGenAI } from "@google/genai";

type GroqResponse = {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
};

const client: unknown =
  process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== ""
    ? new (GoogleGenAI as unknown as { new (options: { apiKey: string }): unknown })({
        apiKey: process.env.GEMINI_API_KEY,
      })
    : null;

const aiCache = new Map<string, unknown>();
let isGemini3Blocked = false;
let gemini3BlockTime = 0;
const BLOCK_DURATION = 3600000;

async function queryGroq(promptText: string): Promise<unknown | null> {
  if (!process.env.GROQ_API_KEY) return null;
  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: promptText }],
          response_format: { type: "json_object" },
        }),
      },
    );
    if (response.ok) {
      const data: GroqResponse = await response.json();
      return JSON.parse(data.choices[0].message.content);
    }
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.debug('[SpotifyAI] Groq error:', err.message);
    } else {
      console.debug('[SpotifyAI] Groq error:', err);
    }
  }
  return null;
}

async function queryGemini(promptText: string) {
  if (!client) return null;
  let modelsToTry = [
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite",
  ];
  if (isGemini3Blocked && Date.now() - gemini3BlockTime < BLOCK_DURATION) {
    modelsToTry = ["gemini-3.1-flash-lite", "gemini-3-flash-preview"];
  } else {
    isGemini3Blocked = false;
  }
  for (const modelName of modelsToTry) {
    try {
      const response = await client.models.generateContent({
        model: modelName,
        contents: [{ role: "user", parts: [{ text: promptText }] }],
      });
      const text = (
        response.text ||
        (typeof response.text === "function" ? response.text() : "") ||
        ""
      )
        .trim()
        .replace(/```json|```/g, "");
      if (text) return JSON.parse(text);
    } catch (error: unknown) {
      const err = error as Error;
      if (err.message.includes("429") && modelName.includes("gemini-3")) {
        isGemini3Blocked = true;
        gemini3BlockTime = Date.now();
      }
    }
  }
  return null;
}

export interface TrackMetadata {
  title: string;
  artist: string;
  album: string;
  year: number;
  isrc?: string;
  duration: number;
}

export interface AIQueryResult {
  query: string | null;
  confidence: number;
}

export async function refineSearchWithAI(metadata: TrackMetadata): Promise<AIQueryResult> {
  const cacheKey = `${metadata.title}-${metadata.artist}`.toLowerCase();
  if (aiCache.has(cacheKey)) return aiCache.get(cacheKey);

  const promptText = `Act as a Professional Music Query Architect.
        DATA: Title: "${metadata.title}", Artist: "${metadata.artist}", Album: "${metadata.album}", Year: "${metadata.year}", VERIFIED_ISRC: "${metadata.isrc || "NONE"}", Duration: ${Math.round(metadata.duration / 1000)}s
        TASK: Create a high-precision YouTube search query. Include ISRC if provided. RETURN JSON ONLY: {"query": "Artist Title [ISRC] Topic", "confidence": 100}`;

  const result =
    (await queryGroq(promptText)) || (await queryGemini(promptText));
  if (result) aiCache.set(cacheKey, result);
  return result || { query: null, confidence: 0 };
}
