import { useState } from 'react';
import type { Format, VideoInfo } from '../extractors/types';
import {
  prettyName,
  formatLabel,
  type DownloadMeta,
  type DownloadState,
} from './format';
import { getFilenameFormat, getNotify, formatName } from './settings';
import { notifyDownloadComplete } from './notify';
import {
  startDownloadService,
  stopDownloadService,
  updateDownloadProgress,
  setDownloadCancelHandler,
} from './fgservice';
import { tapSuccess } from './haptics';
import { runDownload } from './downloadPipeline';

type DownloadMap = Record<string, DownloadState>;

export function useDownload(info: VideoInfo | null) {
  const [downloads, setDownloads] = useState<DownloadMap>({});

  const setOne = (id: string, state: DownloadState): void => {
    setDownloads((prev) => ({ ...prev, [id]: state }));
  };

  const clearDownloads = (): void => setDownloads({});

  const startDownload = async (
    format: Format,
    meta?: DownloadMeta
  ): Promise<string | null> => {
    if (!info) return null;
    const id = format.formatId;
    setOne(id, { status: 'downloading', progress: 0 });
    console.log(`[Download] ${info.extractorKey} ${formatLabel(format)}`);

    const controller = new AbortController();
    setDownloadCancelHandler(() => controller.abort());

    try {
      await startDownloadService();
      const fmt = await getFilenameFormat();
      const rawTitle = meta?.title?.trim() || info.title;
      const stem = prettyName(
        formatName(fmt, rawTitle, info.uploader, info.extractorKey)
      );

      const outcome = await runDownload({
        info,
        format,
        stem,
        signal: controller.signal,
        onState: (state) => {
          setOne(id, state);
          updateDownloadProgress(state.progress);
        },
      });

      if (outcome === 'denied') {
        setOne(id, { status: 'error', progress: 0 });
        return 'Save canceled — media access was not granted.';
      }

      setOne(id, { status: 'saved', progress: 100 });
      tapSuccess();
      if (await getNotify()) {
        notifyDownloadComplete(stem, info.thumbnail).catch(() => undefined);
      }
      return null;
    } catch (e) {
      if (controller.signal.aborted) {
        console.log('[Download] cancelled');
        setDownloads((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        return null;
      }
      const message = e instanceof Error ? e.message : 'Download failed';
      const stack = e instanceof Error && e.stack ? e.stack : '(no stack)';
      console.error(`[Download] failed: ${message}`);
      console.error(`[Download] stack: ${stack}`);
      setOne(id, { status: 'error', progress: 0 });
      return `Download failed: ${message}`;
    } finally {
      setDownloadCancelHandler(null);
      stopDownloadService().catch(() => undefined);
    }
  };

  return { downloads, startDownload, clearDownloads };
}
