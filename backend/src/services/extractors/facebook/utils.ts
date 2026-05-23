// decode str
export function decode(s: string): string {
  try {
    if (s.startsWith('"') && s.endsWith('"')) return JSON.parse(s);
    let res = s.replace(/\\u([0-9a-fA-F]{4})/gu, (_match, grp) =>
      String.fromCharCode(parseInt(grp, 16))
    );
    res = res
      .replace(/\\\//gu, '/')
      .replace(/\\"/gu, '"')
      .replace(/\\\\/gu, '\\');
    return res
      .replace(/&amp;/gu, '&')
      .replace(/&quot;/gu, '"')
      .replace(/&lt;/gu, '<')
      .replace(/&gt;/gu, '>');
  } catch (_err) {
    return s.replace(/\\/gu, '').replace(/&amp;/gu, '&');
  }
}

// decode meta
export function decodeFull(s: string): string {
  try {
    return s
      .replace(/\\u([0-9a-fA-F]{4})/gu, (_, g) =>
        String.fromCharCode(parseInt(g, 16))
      )
      .replace(/\\u([0-9a-fA-F]{4})/gu, (_, g) =>
        String.fromCharCode(parseInt(g, 16))
      )
      .replace(/\\"/gu, '"')
      .replace(/\\\\/gu, '\\')
      .replace(/&amp;/gu, '&')
      .replace(/&quot;/gu, '"')
      .replace(/&lt;/gu, '<')
      .replace(/&gt;/gu, '>');
  } catch (_e) {
    return s;
  }
}

// parse obj
export function extractObject(str: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startIndex; i < str.length; i++) {
    const char = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"' && !escape) {
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
