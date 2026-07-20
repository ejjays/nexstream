import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const HISTORY_KEY = 'nexstream.download.history';

export type HistoryItem = {
  id: string;
  title: string;
  author?: string;
  platform: string;
  ext: string;
  isAudio: boolean;
  thumbnail?: string;
  uri?: string;
  savedAt: number;
};

function read(): Promise<HistoryItem[]> {
  return AsyncStorage.getItem(HISTORY_KEY)
    .then((raw) => {
      if (!raw) return [];
      const parsed = JSON.parse(raw) as HistoryItem[];
      return Array.isArray(parsed) ? parsed : [];
    })
    .catch(() => []);
}

function write(items: HistoryItem[]): Promise<void> {
  return AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(items)).catch(
    () => undefined
  );
}

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

export function subscribeHistory(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const MAX_ITEMS = 200;

export async function addHistory(item: HistoryItem): Promise<void> {
  const items = await read();
  const next = [item, ...items.filter((it) => it.id !== item.id)].slice(
    0,
    MAX_ITEMS
  );
  await write(next);
  emit();
}

export async function removeHistory(id: string): Promise<void> {
  const items = await read();
  await write(items.filter((it) => it.id !== id));
  emit();
}

export async function clearHistory(): Promise<void> {
  await write([]);
  emit();
}

export function useDownloadHistory(): {
  items: HistoryItem[];
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async (): Promise<void> => {
    setItems(await read());
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    return subscribeHistory(() => void refresh());
  }, []);

  return { items, loading, refresh };
}
