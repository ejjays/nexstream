import { useCallback } from 'react';
import * as Clipboard from 'expo-clipboard';

const LINK_RE = /^https?:\/\//iu;

export function useClipboardPaste(setLink: (text: string) => void) {
  const readClipboard = useCallback(async (): Promise<string> => {
    try {
      const text = await Clipboard.getStringAsync();
      return text && LINK_RE.test(text.trim()) ? text.trim() : '';
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
