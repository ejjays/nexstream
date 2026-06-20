import { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, StatusBar, AppState } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  KeyboardProvider,
  KeyboardAwareScrollView,
} from 'react-native-keyboard-controller';
import { Image } from 'expo-image';
import LinkPing from './src/components/LinkPing';
import { useDeviceContext } from 'twrnc';
import { File, Paths } from 'expo-file-system';
import { deleteAsync } from 'expo-file-system/legacy';
import tw from './src/lib/tw';
import meow from './assets/meow.webp';
import Button3D from './src/components/Button3D';
import DotBackground from './src/components/DotBackground';
import Header from './src/components/Header';
import BottomNav from './src/components/BottomNav';
import SettingsScreen from './src/components/SettingsScreen';
import FormatBar, { type DownloadMode } from './src/components/FormatBar';
import { resolve } from './src/extractors';
import { DESKTOP_UA } from './src/extractors/facebook/constants';
import { Format, VideoInfo } from './src/extractors/types';
import PickerModal from './src/components/PickerModal';
import YouTubeExtractorWebView from './src/components/YouTubeExtractorWebView';
import { DownloadState, DownloadMeta, formatLabel } from './src/lib/format';
import { saveToDevice } from './src/lib/save';
import { muxVideoAudio, transcodeToMp3 } from './src/lib/mux';
import { chunkedDownload } from './src/lib/download';
import { getStringAsync as getClipboardText } from 'expo-clipboard';
import {
  getFilenameFormat,
  getAutoPaste,
  getNotify,
  formatName,
} from './src/lib/settings';
import {
  notifyDownloadComplete,
  addDownloadTapListener,
} from './src/lib/notify';
import {
  registerDownloadService,
  startDownloadService,
  stopDownloadService,
} from './src/lib/fgservice';
import { openGallery } from './src/lib/gallery';
import {
  impactAsync,
  ImpactFeedbackStyle,
  notificationAsync,
  NotificationFeedbackType,
} from 'expo-haptics';
import { useFonts } from 'expo-font';
import IBMPlexMonoRegular from './assets/fonts/IBMPlexMono-Regular.ttf';
import IBMPlexMonoMedium from './assets/fonts/IBMPlexMono-Medium.ttf';
import IBMPlexMonoSemiBold from './assets/fonts/IBMPlexMono-SemiBold.ttf';
import IBMPlexMonoBold from './assets/fonts/IBMPlexMono-Bold.ttf';
import RubikRegular from './assets/fonts/Rubik-Regular.ttf';
import RubikMedium from './assets/fonts/Rubik-Medium.ttf';
import RubikSemiBold from './assets/fonts/Rubik-SemiBold.ttf';
import RubikBold from './assets/fonts/Rubik-Bold.ttf';

function prettyName(title: string): string {
  const cleaned = title
    .replace(/[<>:"/\\|?*]/gu, '')
    .replace(/[\r\n\t]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (cleaned.length > 64) return `${cleaned.slice(0, 64).trim()}...`;
  return cleaned || 'video';
}

function refererFor(extractorKey: string): string {
  if (extractorKey === 'tiktok') return 'https://www.tiktok.com/';
  if (extractorKey === 'x') return 'https://x.com/';
  if (extractorKey === 'threads') return 'https://www.threads.com/';
  return 'https://www.facebook.com/';
}

function cleanUrl(raw: string): string {
  return raw.trim().replace(/^['"\s]+|['"\s]+$/gu, '');
}

export default function App() {
  useDeviceContext(tw);

  const [fontsLoaded, fontError] = useFonts({
    IBMPlexMono: IBMPlexMonoRegular,
    'IBMPlexMono-Medium': IBMPlexMonoMedium,
    'IBMPlexMono-SemiBold': IBMPlexMonoSemiBold,
    'IBMPlexMono-Bold': IBMPlexMonoBold,
    Rubik: RubikRegular,
    'Rubik-Medium': RubikMedium,
    'Rubik-SemiBold': RubikSemiBold,
    'Rubik-Bold': RubikBold,
  });

  const [tab, setTab] = useState<'home' | 'settings' | 'docs'>('home');
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});
  const [mode, setMode] = useState<DownloadMode>('mp4');
  const dismissedRef = useRef(false);

  const setDownload = (id: string, state: DownloadState) => {
    setDownloads((prev) => ({ ...prev, [id]: state }));
  };

  useEffect(() => {
    const tryAutoPaste = async () => {
      if (!(await getAutoPaste())) return;
      const text = (await getClipboardText().catch(() => '')).trim();
      if (/^https?:\/\//u.test(text)) setLink((prev) => prev || text);
    };
    tryAutoPaste();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tryAutoPaste();
    });
    return () => sub.remove();
  }, []);

  const handlePaste = async () => {
    const text = await getClipboardText();
    if (text.trim()) setLink(text.trim());
  };

  useEffect(() => {
    registerDownloadService();
    const sub = addDownloadTapListener(() => {
      openGallery();
    });
    return () => sub.remove();
  }, []);

  const handleResolve = async () => {
    if (!link.trim() || loading) return;
    impactAsync(ImpactFeedbackStyle.Medium).catch(() => undefined);
    const url = cleanUrl(link);
    dismissedRef.current = false;
    setLoading(true);
    setError(null);
    setInfo(null);
    setDownloads({});
    console.log(`[Resolve] ${url}`);
    try {
      const result = await resolve(url, (partial) => {
        if (!dismissedRef.current) setInfo(partial);
      });
      if (!result) {
        setError('No video found, or this link is not supported yet.');
        return;
      }
      if (!dismissedRef.current) setInfo(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong.';
      console.error(`[Resolve] failed: ${message}`);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (format: Format, meta?: DownloadMeta) => {
    if (!info) return;
    const id = format.formatId;
    setError(null);
    setDownload(id, { status: 'downloading', progress: 0 });
    console.log(`[Download] ${info.extractorKey} ${formatLabel(format)}`);

    try {
      await startDownloadService();
      const ext = format.extension || 'mp4';
      const rawTitle = meta?.title?.trim() || info.title;
      const fmt = await getFilenameFormat();
      const stem = prettyName(
        formatName(fmt, rawTitle, info.uploader, info.extractorKey)
      );
      const headers = info.downloadHeaders ?? {
        'User-Agent': DESKTOP_UA,
        Referer: refererFor(info.extractorKey),
      };

      const isYt =
        info.extractorKey === 'youtube' || info.extractorKey === 'spotify';
      const mb = (bytes: number) => (bytes / 1048576).toFixed(1);
      const fetchTo = async (
        dlUrl: string,
        dest: File,
        base: number,
        cap: number,
        label: string
      ): Promise<void> => {
        const startedAt = Date.now();
        let written = 0;
        const onProg = (done: number, total: number) => {
          written = done;
          if (total > 0) {
            setDownload(id, {
              status: 'downloading',
              progress: base + Math.round((done / total) * cap),
            });
          }
        };
        if (isYt) {
          await chunkedDownload(dlUrl, headers, dest, onProg);
        } else {
          await File.downloadFileAsync(dlUrl, dest, {
            idempotent: true,
            headers,
            onProgress: ({ bytesWritten, totalBytes }) =>
              onProg(bytesWritten, totalBytes),
          });
        }
        const secs = Math.max((Date.now() - startedAt) / 1000, 0.1);
        console.log(
          `[Download] ${label} ${mb(written)}MB in ${secs.toFixed(1)}s (${(written / 1048576 / secs).toFixed(1)} MB/s)`
        );
      };

      let saveTarget: File;

      if (format.extension === 'mp3') {
        const srcFile = new File(Paths.cache, `${stem}.audtmp`);
        await fetchTo(format.url, srcFile, 0, 85, 'audio');
        setDownload(id, { status: 'muxing', progress: 90 });
        const outFile = new File(Paths.cache, `${stem}.mp3`);
        const ok = await transcodeToMp3(srcFile, outFile);
        await deleteAsync(srcFile.uri, { idempotent: true }).catch(
          () => undefined
        );
        if (!ok) throw new Error('MP3 conversion failed');
        saveTarget = outFile;
      } else if (format.muxAudioUrl) {
        const videoFile = new File(Paths.cache, `${stem}.vid.${ext}`);
        const audioFile = new File(
          Paths.cache,
          `${stem}.aud.${format.muxAudioExt || 'm4a'}`
        );
        await fetchTo(format.url, videoFile, 0, 80, 'video');
        await fetchTo(format.muxAudioUrl, audioFile, 80, 10, 'audio');
        setDownload(id, { status: 'muxing', progress: 92 });
        const outFile = new File(Paths.cache, `${stem}.${ext}`);
        const mStart = Date.now();
        const ok = await muxVideoAudio(videoFile, audioFile, outFile);
        console.log(
          `[Download] mux ${ok ? 'ok' : 'failed'} in ${((Date.now() - mStart) / 1000).toFixed(1)}s`
        );
        await deleteAsync(videoFile.uri, { idempotent: true }).catch(
          () => undefined
        );
        await deleteAsync(audioFile.uri, { idempotent: true }).catch(
          () => undefined
        );
        if (!ok) throw new Error('Muxing failed');
        saveTarget = outFile;
      } else {
        const destination = new File(Paths.cache, `${stem}.${ext}`);
        await fetchTo(format.url, destination, 0, 100, 'file');
        saveTarget = destination;
      }

      const saved = await saveToDevice(saveTarget);
      await deleteAsync(saveTarget.uri, { idempotent: true }).catch(
        () => undefined
      );

      if (!saved) {
        setDownload(id, { status: 'error', progress: 0 });
        setError('Save canceled — media access was not granted.');
        return;
      }
      setDownload(id, { status: 'saved', progress: 100 });
      notificationAsync(NotificationFeedbackType.Success).catch(
        () => undefined
      );
      if (await getNotify()) {
        notifyDownloadComplete(stem).catch(() => undefined);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Download failed';
      const stack = e instanceof Error && e.stack ? e.stack : '(no stack)';
      console.error(`[Download] failed: ${message}`);
      console.error(`[Download] stack: ${stack}`);
      setDownload(id, { status: 'error', progress: 0 });
      setError(`Download failed: ${message}`);
    } finally {
      stopDownloadService().catch(() => undefined);
    }
  };

  if (!fontsLoaded && !fontError) {
    return <View style={tw`flex-1 bg-background`} />;
  }

  return (
    // skipcq: JS-0415
    <GestureHandlerRootView style={tw`flex-1 bg-background`}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <SafeAreaView style={tw`flex-1 bg-background`}>
            <StatusBar barStyle="light-content" backgroundColor="#030014" />
            <DotBackground />
            <Header />
            <KeyboardAwareScrollView
              style={tw`flex-1`}
              contentContainerStyle={tw`grow items-center justify-center px-6 pt-8 pb-16`}
              keyboardShouldPersistTaps="handled"
              bottomOffset={24}
            >
              <View style={tw`w-full max-w-md`}>
                <View style={tw`mb-8 items-center`}>
                  <Image
                    source={meow}
                    style={tw`h-46 w-46 md:h-52 md:w-52`}
                    contentFit="contain"
                  />
                </View>

                <View style={tw`relative justify-center`}>
                  <View style={tw`absolute left-4 z-10`}>
                    <LinkPing />
                  </View>
                  <TextInput
                    style={[
                      tw`rounded-2xl border-2 border-primary bg-black/30 pl-12 pr-4 font-mono text-[15px] text-white`,
                      { height: 52, textAlignVertical: 'center' },
                    ]}
                    placeholder="paste your link here"
                    placeholderTextColor="#5b6472"
                    value={link}
                    onChangeText={setLink}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <FormatBar
                  mode={mode}
                  setMode={setMode}
                  onPaste={handlePaste}
                />

                <Button3D
                  label="Download"
                  loading={loading}
                  onPress={handleResolve}
                />

                {error ? (
                  <View
                    style={tw`mt-5 rounded-2xl border border-red-400/40 bg-red-400/10 p-4`}
                  >
                    <Text selectable style={tw`font-mono text-sm text-red-400`}>
                      {error}
                    </Text>
                    <Text style={tw`mt-2 font-mono text-[11px] text-slate-500`}>
                      long-press to copy
                    </Text>
                  </View>
                ) : null}
              </View>
            </KeyboardAwareScrollView>
            <SettingsScreen visible={tab === 'settings'} />
            <BottomNav onChange={setTab} />
            <PickerModal
              info={info}
              downloads={downloads}
              preferAudio={mode === 'mp3' || info?.extractorKey === 'spotify'}
              onClose={() => {
                dismissedRef.current = true;
                setInfo(null);
              }}
              onDownload={handleDownload}
            />
            <YouTubeExtractorWebView />
          </SafeAreaView>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
