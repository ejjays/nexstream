import { File, Paths } from 'expo-file-system';
import { deleteAsync, moveAsync } from 'expo-file-system/legacy';
import { DESKTOP_UA } from '../userAgents';
import type { Format, VideoInfo } from '../../extractors/types';
import { refererFor, type DownloadState } from '../format';
import { chunkedDownload } from './download';
import {
  muxVideoAudio,
  transcodeToMp3,
  hlsToMp4,
  parallelHlsToMp4,
  parallelHlsMuxedToMp4,
  tagAudio,
} from './mux';
import { saveToDevice } from './save';

export type DownloadOutcome = { status: 'saved' | 'denied'; uri?: string };

export type RunDownloadInput = {
  info: VideoInfo;
  format: Format;
  stem: string;
  tag?: { title?: string; artist?: string };
  signal: AbortSignal;
  onState: (state: DownloadState) => void;
};

const removeFile = (file: File): Promise<void> =>
  deleteAsync(file.uri, { idempotent: true }).catch(() => undefined);

const mb = (bytes: number): string => (bytes / 1048576).toFixed(1);

async function tagAudioInPlace(
  saveTarget: File,
  stem: string,
  info: VideoInfo,
  tag: { title?: string; artist?: string } | undefined,
  track: (file: File) => File
): Promise<void> {
  let cover: File | undefined;
  if (info.thumbnail) {
    try {
      const art = track(new File(Paths.cache, `${stem}.cover.jpg`));
      await File.downloadFileAsync(info.thumbnail, art, { idempotent: true });
      cover = art;
    } catch {
      /* cover optional */
    }
  }
  const saveExt = saveTarget.name.split('.').pop() || 'm4a';
  const tagged = track(new File(Paths.cache, `${stem}.tagged.${saveExt}`));
  const ok = await tagAudio(
    saveTarget,
    tagged,
    {
      title: tag?.title || info.title,
      artist: tag?.artist || info.uploader,
      album: info.album,
    },
    cover
  );
  if (ok) {
    await removeFile(saveTarget);
    await moveAsync({ from: tagged.uri, to: saveTarget.uri });
  }
}

export async function runDownload({
  info,
  format,
  stem,
  tag,
  signal,
  onState,
}: RunDownloadInput): Promise<DownloadOutcome> {
  const temps: File[] = [];
  const track = (file: File): File => {
    temps.push(file);
    return file;
  };

  try {
    const ext = format.extension || 'mp4';
    const headers = info.downloadHeaders ?? {
      'User-Agent': DESKTOP_UA,
      Referer: refererFor(info.extractorKey),
    };
    const chunked =
      info.extractorKey === 'youtube' || info.extractorKey === 'spotify';

    const fetchTo = async (
      dlUrl: string,
      dest: File,
      base: number,
      cap: number,
      label: string
    ): Promise<void> => {
      const startedAt = Date.now();
      let written = 0;
      const onProg = (done: number, total: number): void => {
        written = done;
        if (total > 0) {
          onState({
            status: 'downloading',
            progress: base + Math.round((done / total) * cap),
          });
        }
      };
      if (chunked) {
        await chunkedDownload(dlUrl, headers, dest, onProg, signal);
      } else {
        await File.downloadFileAsync(dlUrl, dest, {
          idempotent: true,
          headers,
          onProgress: ({ bytesWritten, totalBytes }) =>
            onProg(bytesWritten, totalBytes),
        });
      }
      if (signal.aborted) throw new Error('cancelled');
      const secs = Math.max((Date.now() - startedAt) / 1000, 0.1);
      console.log(
        `[Download] ${label} ${mb(written)}MB in ${secs.toFixed(1)}s (${(written / 1048576 / secs).toFixed(1)} MB/s)`
      );
    };

    let saveTarget: File;

    if (format.extension === 'mp3') {
      if (format.noTranscode) {
        // already native mp3; download & keep untouched
        const outFile = track(new File(Paths.cache, `${stem}.mp3`));
        await fetchTo(format.url, outFile, 0, 100, 'audio');
        saveTarget = outFile;
      } else {
        const srcFile = track(new File(Paths.cache, `${stem}.audtmp`));
        await fetchTo(format.url, srcFile, 0, 85, 'audio');
        onState({ status: 'muxing', progress: 90 });
        const outFile = track(new File(Paths.cache, `${stem}.mp3`));
        const ok = await transcodeToMp3(srcFile, outFile);
        await removeFile(srcFile);
        if (!ok) throw new Error('MP3 conversion failed');
        saveTarget = outFile;
      }
    } else if (format.muxAudioUrl) {
      const videoFile = track(new File(Paths.cache, `${stem}.vid.${ext}`));
      const audioFile = track(
        new File(Paths.cache, `${stem}.aud.${format.muxAudioExt || 'm4a'}`)
      );
      await fetchTo(format.url, videoFile, 0, 80, 'video');
      await fetchTo(format.muxAudioUrl, audioFile, 80, 10, 'audio');
      onState({ status: 'muxing', progress: 92 });
      const outFile = track(new File(Paths.cache, `${stem}.${ext}`));
      const mStart = Date.now();
      const ok = await muxVideoAudio(videoFile, audioFile, outFile);
      console.log(
        `[Download] mux ${ok ? 'ok' : 'failed'} in ${((Date.now() - mStart) / 1000).toFixed(1)}s`
      );
      await removeFile(videoFile);
      await removeFile(audioFile);
      if (!ok) throw new Error('Muxing failed');
      saveTarget = outFile;
    } else if (format.isHls) {
      const outFile = track(new File(Paths.cache, `${stem}.${ext}`));
      // sum segment durations for progress
      let durationSec = info.duration ?? 0;
      if (!durationSec) {
        try {
          const playlist = await (await fetch(format.url, { headers })).text();
          durationSec = [...playlist.matchAll(/#EXTINF:([\d.]+)/gu)].reduce(
            (sum, hit) => sum + Number(hit[1]),
            0
          );
        } catch {
          /* progress optional */
        }
      }
      onState({ status: 'downloading', progress: 0 });
      const hStart = Date.now();
      const onHls = (pct: number): void =>
        onState({ status: 'downloading', progress: Math.min(98, pct) });
      // separate video+audio hls -> parallel fetch; else ffmpeg
      let ok = false;
      let path = 'ffmpeg';
      if (format.hlsAudioUrl) {
        ok = await parallelHlsToMp4(
          format.url,
          format.hlsAudioUrl,
          outFile,
          headers,
          onHls,
          signal
        );
        if (ok) path = 'parallel';
      } else {
        ok = await parallelHlsMuxedToMp4(
          format.url,
          outFile,
          headers,
          onHls,
          signal
        );
        if (ok) path = 'parallel-muxed';
      }
      if (signal.aborted) throw new Error('cancelled');
      if (!ok) {
        ok = await hlsToMp4(
          format.url,
          outFile,
          durationSec,
          onHls,
          format.hlsAudioUrl,
          format.hlsKeepAlive
        );
      }
      console.log(
        `[Download] hls (${path}) ${ok ? 'ok' : 'failed'} in ${((Date.now() - hStart) / 1000).toFixed(1)}s`
      );
      if (signal.aborted) throw new Error('cancelled');
      if (!ok) throw new Error('HLS download failed');
      // big 4k saves are slow; avoid a frozen-looking 98%
      onState({ status: 'muxing', progress: 99 });
      saveTarget = outFile;
    } else {
      const destination = track(new File(Paths.cache, `${stem}.${ext}`));
      await fetchTo(format.url, destination, 0, 100, 'file');
      saveTarget = destination;
    }

    // tag audio so players show title/artist/art
    if (format.isAudio && !format.isVideo) {
      await tagAudioInPlace(saveTarget, stem, info, tag, track);
    }

    const saved = await saveToDevice(saveTarget, (pct) =>
      onState({ status: 'saving', progress: pct })
    );
    await removeFile(saveTarget);
    return saved.ok
      ? { status: 'saved', uri: saved.uri }
      : { status: 'denied' };
  } finally {
    await Promise.all(temps.map(removeFile));
  }
}
