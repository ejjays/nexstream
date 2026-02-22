const { GoogleGenAI } = require("@google/genai");
const fetch = require("isomorphic-unfetch");

const client = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "" ? new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
}) : null;

const aiCache = new Map();
let isGemini3Blocked = false;
let gemini3BlockTime = 0;
const BLOCK_DURATION = 3600000;

async function queryGroq(promptText) {
    if (!process.env.GROQ_API_KEY) return null;
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: promptText }],
                response_format: { type: "json_object" }
            })
        });
        if (response.ok) {
            const data = await response.json();
            return JSON.parse(data.choices[0].message.content);
        }
    } catch (err) {}
    return null;
}

async function queryGemini(promptText) {
    if (!client) return null;
    let modelsToTry = ["gemini-3-flash-preview", "gemini-2.5-flash-lite", "gemini-2.0-flash-latest"];
    if (isGemini3Blocked && (Date.now() - gemini3BlockTime < BLOCK_DURATION)) {
        modelsToTry = ["gemini-2.5-flash-lite", "gemini-2.0-flash-latest"];
    } else {
        isGemini3Blocked = false;
    }
    for (const modelName of modelsToTry) {
        try {
            const response = await client.models.generateContent({
                model: modelName,
                contents: [{ role: "user", parts: [{ text: promptText }] }]
            });
            const text = (response.text || (typeof response.text === "function" ? response.text() : "") || "").trim().replace(/```json|```/g, "");
            if (text) return JSON.parse(text);
        } catch (error) {
            if (error.message.includes("429") && modelName.includes("gemini-3")) {
                isGemini3Blocked = true;
                gemini3BlockTime = Date.now();
            }
        }
    }
    return null;
}

async function refineSearchWithAI(metadata) {
    const cacheKey = `${metadata.title}-${metadata.artist}`.toLowerCase();
    if (aiCache.has(cacheKey)) return aiCache.get(cacheKey);

    const promptText = `Act as a Professional Music Query Architect.
        DATA: Title: "${metadata.title}", Artist: "${metadata.artist}", Album: "${metadata.album}", Year: "${metadata.year}", VERIFIED_ISRC: "${metadata.isrc || "NONE"}", Duration: ${Math.round(metadata.duration / 1000)}s
        TASK: Create a high-precision YouTube search query. Include ISRC if provided. RETURN JSON ONLY: {"query": "Artist Title [ISRC] Topic", "confidence": 100}`;
    
    const result = (await queryGroq(promptText)) || (await queryGemini(promptText));
    if (result) aiCache.set(cacheKey, result);
    return result || { query: null, confidence: 0 };
}

module.exports = {
    refineSearchWithAI
};
