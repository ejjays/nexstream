import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StatusBar,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  KeyboardProvider,
  KeyboardAwareScrollView,
} from 'react-native-keyboard-controller';
import { Image } from 'expo-image';
import { Link as LinkIcon } from 'lucide-react-native';
import { useDeviceContext } from 'twrnc';
import { File, Paths } from 'expo-file-system';
import { deleteAsync } from 'expo-file-system/legacy';
import tw from './src/lib/tw';
import meow from './assets/meow.webp';
import GlowButton from './src/components/GlowButton';
import DotBackground from './src/components/DotBackground';
import Header from './src/components/Header';
import BottomNav from './src/components/BottomNav';
import FormatBar, { type DownloadMode } from './src/components/FormatBar';
import { resolve } from './src/extractors';
import { DESKTOP_UA } from './src/extractors/facebook/constants';
import { Format, VideoInfo } from './src/extractors/types';
import PickerModal from './src/components/PickerModal';
import YouTubeExtractorWebView from './src/components/YouTubeExtractorWebView';
import { DownloadState, DownloadMeta, formatLabel } from './src/lib/format';
import { saveToDevice } from './src/lib/save';
import { muxVideoAudio } from './src/lib/mux';
import { chunkedDownload } from './src/lib/download';
import * as Clipboard from 'expo-clipboard';
import { useFonts } from 'expo-font';
import IBMPlexMonoRegular from './assets/fonts/IBMPlexMono-Regular.ttf';
import IBMPlexMonoMedium from './assets/fonts/IBMPlexMono-Medium.ttf';
import IBMPlexMonoSemiBold from './assets/fonts/IBMPlexMono-SemiBold.ttf';
import IBMPlexMonoBold from './assets/fonts/IBMPlexMono-Bold.ttf';

function safeName(name: string): string {
  return name.replace(/[^\w.-]+/gu, '_').slice(0, 50) || 'video';
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
  });

  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});
  const [mode, setMode] = useState<DownloadMode>('mp4');

  const setDownload = (id: string, state: DownloadState) => {
    setDownloads((prev) => ({ ...prev, [id]: state }));
  };

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text.trim()) setLink(text.trim());
  };

  const handleResolve = async () => {
    const url = cleanUrl(link);
    setLoading(true);
    setError(null);
    setInfo(null);
    setDownloads({});
    console.log(`[Resolve] ${url}`);
    try {
      const result = await resolve(url);
      if (!result) {
        setError('No video found, or this link is not supported yet.');
        return;
      }
      setInfo(result);
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
      const ext = format.extension || 'mp4';
      const baseName = meta?.title?.trim() || info.title;
      const stem = `nexstream_${safeName(baseName)}_${formatLabel(format)}`;
      const headers = info.downloadHeaders ?? {
        'User-Agent': DESKTOP_UA,
        Referer: refererFor(info.extractorKey),
      };

      const isYt = info.extractorKey === 'youtube';
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

      if (format.muxAudioUrl) {
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
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Download failed';
      const stack = e instanceof Error && e.stack ? e.stack : '(no stack)';
      console.error(`[Download] failed: ${message}`);
      console.error(`[Download] stack: ${stack}`);
      setDownload(id, { status: 'error', progress: 0 });
      setError(`Download failed: ${message}`);
    }
  };

  const busy = loading || !link.trim();

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
                    <LinkIcon size={20} color="#06b6d4" />
                  </View>
                  <TextInput
                    style={[
                      tw`rounded-2xl border-2 border-primary/60 bg-black/30 pl-12 pr-4 font-mono text-[15px] text-white`,
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

                <GlowButton
                  label="Resolve"
                  loading={loading}
                  disabled={busy}
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
            <BottomNav />
            <PickerModal
              info={info}
              downloads={downloads}
              preferAudio={mode === 'mp3'}
              onClose={() => setInfo(null)}
              onDownload={handleDownload}
            />
            <YouTubeExtractorWebView />
          </SafeAreaView>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
