const axios = require('axios');

/**
 * Service to fetch chords from Ultimate Guitar using Gemini Grounding (Google Search)
 * Uses Vertex AI Express endpoint and Gemini 3 Flash Preview model.
 */
async function getUgChords(artist, title, lyrics = null, keyHint = null) {
  const apiKey = process.env.VERTEX_API_KEY;
  if (!apiKey) {
    console.error("UG Grounding: VERTEX_API_KEY is missing");
    return null;
  }

  try {
    const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

    let prompt = `Song Request: "${title}" by "${artist}".\nTarget Site: ultimate-guitar.com\n\n`;

    if (lyrics) {
      prompt += `Correct Lyrics Context (Match this version):\n${lyrics.substring(0, 400)}...\n\n`;
    }

    if (keyHint) {
      prompt += `Key Hint: Match the version in the key of ${keyHint} if possible.\n\n`;
    }

    prompt += `MANDATORY INSTRUCTIONS:
1. Search specifically for the FULL CHORD TAB on ultimate-guitar.com.
2. Return the ENTIRE song from [Intro] to [Outro]. DO NOT TRUNCATE OR CUT THE CONTENT.
3. You MUST provide the FULL lyrics with chords placed exactly above the corresponding syllables.
4. WRAP EVERY SINGLE CHORD in [ch] tags, for example: [ch]Fmaj7[/ch], [ch]C[/ch], [ch]Am[/ch].
5. PRESERVE THE EXACT TAB SPACING AND MONOSPACE ALIGNMENT.
6. NO INTRODUCTIONS, NO CHAT, NO MARKDOWN BLOCKS. Just the plain text chord sheet content.
7. If the tab has multiple pages or sections, combine them into one complete sheet.`;

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      tools: [{ google_search: {} }],
      generationConfig: {
        maxOutputTokens: 4096, // Increased to ensure full song fits
        temperature: 0.1,
      },
    };

    const res = await axios.post(url, requestBody);

    const candidate = res.data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;

    // Robust logging for Vertex AI grounding sources
    const metadata = candidate?.groundingMetadata || res.data.groundingMetadata;
    if (metadata) {
      const chunks = metadata.groundingChunks || metadata.grounding_chunks || [];
      if (chunks.length > 0) {
        console.log(`[UG GROUNDING] Found ${chunks.length} grounding sources:`);
        chunks.forEach((chunk, i) => {
          const uri = chunk.web?.uri || chunk.web_chunk?.uri || "Unknown URI";
          console.log(`  -> ${uri}`);
        });
      }
    }

    if (!text || text.length < 50) {
      console.warn("UG Grounding: Received very short or empty response");
      return null;
    }

    // Secondary check for cut-off (if it ends abruptly)
    if (text.length < 200 && !text.toLowerCase().includes('outro') && !text.toLowerCase().includes('end')) {
        console.log("[UG GROUNDING] Response seems suspiciously short, might be truncated.");
    }

    return text;
  } catch (error) {
    console.error(
      "UG Grounding Error:",
      error.response?.data || error.message
    );
    return null;
  }
}

module.exports = {
  getUgChords,
};
