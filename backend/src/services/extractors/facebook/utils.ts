// decode string
export function decode(s: string): string {
    try {
        if (s.startsWith('"') && s.endsWith('"')) return JSON.parse(s);
        return s.replace(/\\\/|\\\\/g, m => m === '\\\/' ? '/' : '\\')
                .replace(/\\u([0-9a-fA-F]{4})/g, (_, g) => String.fromCharCode(parseInt(g, 16)))
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>');
    } catch (e) {
        return s.replace(/\\/g, '').replace(/&amp;/g, '&');
    }
}

// decode metadata
export function decodeFull(s: string): string {
    try {
        return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, g) => String.fromCharCode(parseInt(g, 16)))
                .replace(/\\u([0-9a-fA-F]{4})/g, (_, g) => String.fromCharCode(parseInt(g, 16)))
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, '\\')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>');
    } catch (e) { return s; }
}

// extract object
export function extractObject(str: string, startIndex: number): string | null {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = startIndex; i < str.length; i++) {
        const char = str[i];
        if (escape) { escape = false; continue; }
        if (char === '\\') { escape = true; continue; }
        if (char === '"' && !escape) { inString = !inString; continue; }
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
