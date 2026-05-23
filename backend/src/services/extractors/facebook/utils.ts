// decode str
export function decode(text: string): string {
  try {
    if (text.startsWith('"') && text.endsWith('"')) return JSON.parse(text);
    let decodedText = text.replace(/\\u([0-9a-fA-F]{4})/gu, (_match, group) =>
      String.fromCharCode(parseInt(group, 16))
    );
    decodedText = decodedText
      .replace(/\\\//gu, '/')
      .replace(/\\"/gu, '"')
      .replace(/\\\\/gu, '\\');
    return decodedText
      .replace(/&amp;/gu, '&')
      .replace(/&quot;/gu, '"')
      .replace(/&lt;/gu, '<')
      .replace(/&gt;/gu, '>');
  } catch (error) {
    console.debug('Ignored:', (error as Error).message);
    return text.replace(/\\/gu, '').replace(/&amp;/gu, '&');
  }
}

// decode meta
export function decodeFull(text: string): string {
  try {
    return text
      .replace(/\\u([0-9a-fA-F]{4})/gu, (_match, group) =>
        String.fromCharCode(parseInt(group, 16))
      )
      .replace(/\\u([0-9a-fA-F]{4})/gu, (_match, group) =>
        String.fromCharCode(parseInt(group, 16))
      )
      .replace(/\\"/gu, '"')
      .replace(/\\\\/gu, '\\')
      .replace(/&amp;/gu, '&')
      .replace(/&quot;/gu, '"')
      .replace(/&lt;/gu, '<')
      .replace(/&gt;/gu, '>');
  } catch (error) {
    console.debug('Ignored:', (error as Error).message);
    return text;
  }
}

// parse obj
export function extractObject(str: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let escapeChar = false;
  for (let i = startIndex; i < str.length; i++) {
    const char = str[i];
    if (escapeChar) {
      escapeChar = false;
      continue;
    }
    if (char === '\\') {
      escapeChar = true;
      continue;
    }
    if (char === '"' && !escapeChar) {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') depth++;
      else if (char === '}') {
        depth--;
        if (depth === 0) return str.substring(startIndex, i + 1);
      }
    }
  }
  return null;
}
