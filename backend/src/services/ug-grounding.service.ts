export async function getUgChords(
  artist: string, 
  title: string, 
  lyrics: string | null = null, 
  keyHint: string | null = null
): Promise<string | null> {
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

    prompt += `MANDATORY INSTRUCTIONS:\n1. Search specifically for the FULL CHORD TAB on ultimate-guitar.com.\n2. Return the ENTIRE song from [Intro] to [Outro]. DO NOT TRUNCATE OR CUT THE CONTENT.\n3. You MUST provide the FULL lyrics with chords placed exactly above the corresponding syllables.\n4. WRAP EVERY SINGLE CHORD in [ch] tags, for example: [ch]Fmaj7[/ch], [ch]C[/ch], [ch]Am[/ch].\n5. PRESERVE THE EXACT TAB SPACING AND MONOSPACE ALIGNMENT.\n6. NO INTRODUCTIONS, NO CHAT, NO MARKDOWN BLOCKS. Just the plain text chord sheet content.\n7. If the tab has multiple pages or sections, combine them into one complete sheet.`;

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      tools: [{ google_search: {} }],
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.1,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const data: any = await res.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;

    const metadata = candidate?.groundingMetadata || data.groundingMetadata;
    if (metadata) {
      const chunks = metadata.groundingChunks || metadata.grounding_chunks || [];
      if (chunks.length > 0) {
        console.log(`[UG GROUNDING] Found ${chunks.length} grounding sources:`);
        chunks.forEach((chunk: any) => {
          const uri = chunk.web?.uri || chunk.web_chunk?.uri || "Unknown URI";
          console.log(`  -> ${uri}`);
        });
      }
    }

    if (!text || text.length < 50) return null;
    return text;
  } catch (error: any) {
    console.error("UG Grounding Error:", error.message);
    return null;
  }
}
