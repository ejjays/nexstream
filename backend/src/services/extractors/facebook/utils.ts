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
