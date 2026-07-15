import { useCallback } from 'react';
import * as Clipboard from 'expo-clipboard';

// matches http/https URLs, handling common edge cases (trailing punctuation, parens)
const URL_RE = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gu;

function extractUrl(text: string): string {
  const match = text.match(URL_RE);
  if (!match) return '';
  // strip trailing punctuation that likely isn't part of the URL
  return match[0].replace(/[.,;:!?)\]>]+$/u, '');
}

export function useClipboardPaste(setLink: (text: string) => void) {
  const readClipboard = useCallback(async (): Promise<string> => {
    try {
      const text = await Clipboard.getStringAsync();
      return text ? extractUrl(text) : '';
    } catch {
      return '';
    }
  }, []);

  const paste = useCallback(async () => {
    const text = await readClipboard();
    if (text) setLink(text);
  }, [readClipboard, setLink]);

  return { paste, readClipboard };
}
