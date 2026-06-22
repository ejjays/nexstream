import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StatusBar,
  AppState,
  RefreshControl,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { Image } from 'expo-image';
import LinkPing from './src/components/LinkPing';
import tw from './src/lib/tw';
import meow from './assets/meow.webp';
import Button3D from './src/components/Button3D';
import DotPattern, { useDotTouch } from './src/components/DotPattern';
import ShootingStars from './src/components/ShootingStars';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Header from './src/components/Header';
import BottomNav from './src/components/BottomNav';
import SettingsScreen from './src/components/SettingsScreen';
import UpdatesScreen from './src/components/UpdatesScreen';
import FormatBar, { type DownloadMode } from './src/components/FormatBar';
import { resolve } from './src/extractors';
import { Format, VideoInfo } from './src/extractors/types';
import PickerModal from './src/components/PickerModal';
import KeyboardAwareScreen from './src/components/KeyboardAwareScreen';
import { useBlurOnKeyboardHide } from './src/lib/useKeyboard';
import YouTubeExtractorWebView from './src/components/YouTubeExtractorWebView';
import ErrorBoundary from './src/components/ErrorBoundary';
import { type DownloadMeta } from './src/lib/format';
import { getStringAsync as getClipboardText } from 'expo-clipboard';
import { getAutoPaste } from './src/lib/settings';
import { addDownloadTapListener } from './src/lib/notify';
import { registerDownloadService } from './src/lib/fgservice';
import { openGallery } from './src/lib/gallery';
import { useDownload } from './src/lib/useDownload';
import { tapImpact, loadHaptics } from './src/lib/haptics';
import { useFonts } from 'expo-font';
import IBMPlexMonoRegular from './assets/fonts/IBMPlexMono-Regular.ttf';
import IBMPlexMonoMedium from './assets/fonts/IBMPlexMono-Medium.ttf';
import IBMPlexMonoSemiBold from './assets/fonts/IBMPlexMono-SemiBold.ttf';
import IBMPlexMonoBold from './assets/fonts/IBMPlexMono-Bold.ttf';
import RubikRegular from './assets/fonts/Rubik-Regular.ttf';
import RubikMedium from './assets/fonts/Rubik-Medium.ttf';
import RubikSemiBold from './assets/fonts/Rubik-SemiBold.ttf';
import RubikBold from './assets/fonts/Rubik-Bold.ttf';

const queryClient = new QueryClient();

function cleanUrl(raw: string): string {
  return raw.trim().replace(/^['"\s]+|['"\s]+$/gu, '');
}

function AppRoot() {
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

  const [tab, setTab] = useState<'home' | 'settings' | 'updates'>('home');
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const { downloads, startDownload, clearDownloads } = useDownload(info);
  const [mode, setMode] = useState<DownloadMode>('mp4');
  const dismissedRef = useRef(false);
  const { touchX, touchY, active, touchHandlers } = useDotTouch();
  const linkInputRef = useRef<TextInput>(null);
  useBlurOnKeyboardHide(linkInputRef);
  const [refreshing, setRefreshing] = useState(false);

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

  const onRefresh = async () => {
    setRefreshing(true);
    setError(null);
    setInfo(null);
    clearDownloads();
    dismissedRef.current = false;
    const [text] = await Promise.all([
      getClipboardText().catch(() => ''),
      new Promise((resolve) => {
        setTimeout(resolve, 700);
      }),
    ]);
    const trimmed = text.trim();
    if (/^https?:\/\//u.test(trimmed)) setLink(trimmed);
    setRefreshing(false);
  };

  useEffect(() => {
    registerDownloadService();
    loadHaptics();
    const unsubscribe = addDownloadTapListener(() => {
      openGallery();
    });
    return unsubscribe;
  }, []);

  const handleResolve = async () => {
    if (!link.trim() || loading) return;
    tapImpact();
    const url = cleanUrl(link);
    dismissedRef.current = false;
    setLoading(true);
    setError(null);
    setInfo(null);
    clearDownloads();
    console.log(`[Resolve] ${url}`);
    try {
      const result = await resolve(url, (partial) => {
        if (!dismissedRef.current) setInfo(partial);
      });
      if (!result) {
        if (!dismissedRef.current) {
          setInfo(null);
          setError('No video found, or this link is not supported yet.');
        }
        return;
      }
      if (!dismissedRef.current) setInfo(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong.';
      console.error(`[Resolve] failed: ${message}`);
      if (!dismissedRef.current) {
        setInfo(null);
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const onDownload = async (format: Format, meta?: DownloadMeta) => {
    setError(null);
    const message = await startDownload(format, meta);
    if (message) setError(message);
  };

  if (!fontsLoaded && !fontError) {
    return <View style={tw`flex-1 bg-background`} />;
  }

  return (
    // skipcq: JS-0415
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={tw`flex-1 bg-background`}>
        <KeyboardProvider>
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <SafeAreaView style={tw`flex-1 bg-background`}>
              <StatusBar barStyle="light-content" backgroundColor="#030014" />
              <DotPattern touchX={touchX} touchY={touchY} active={active} />
              {tab === 'home' && <ShootingStars />}
              <View
                style={[tw`flex-1`, { opacity: tab === 'home' ? 1 : 0 }]}
                pointerEvents={tab === 'home' ? 'auto' : 'none'}
                {...touchHandlers}
              >
                <KeyboardAwareScreen
                  contentContainerStyle={tw`grow px-6 pb-16`}
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={() => void onRefresh()}
                      tintColor="#22d3ee"
                      colors={['#22d3ee']}
                      progressBackgroundColor="#17324c"
                      progressViewOffset={16}
                    />
                  }
                >
                  <Header />
                  <View style={tw`flex-1 items-center justify-center`}>
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
                          ref={linkInputRef}
                          style={[
                            tw`rounded-2xl border-2 border-primary bg-black/30 pl-12 pr-4 font-mono text-[15px] text-white`,
                            { height: 52, textAlignVertical: 'center' },
                          ]}
                          placeholder="paste your link here"
                          placeholderTextColor="#5b6472"
                          value={link}
                          onChangeText={setLink}
                          onFocus={() => {
                            active.value = 0;
                          }}
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
                          <Text
                            selectable
                            style={tw`font-mono text-sm text-red-400`}
                          >
                            {error}
                          </Text>
                          <Text
                            style={tw`mt-2 font-mono text-[11px] text-slate-500`}
                          >
                            long-press to copy
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </KeyboardAwareScreen>
              </View>
              <SettingsScreen visible={tab === 'settings'} />
              <UpdatesScreen visible={tab === 'updates'} />
              <BottomNav onChange={setTab} />
              <PickerModal
                info={info}
                downloads={downloads}
                preferAudio={mode === 'mp3' || info?.extractorKey === 'spotify'}
                onClose={() => {
                  dismissedRef.current = true;
                  setInfo(null);
                }}
                onDownload={onDownload}
              />
              <YouTubeExtractorWebView />
            </SafeAreaView>
          </SafeAreaProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppRoot />
    </ErrorBoundary>
  );
}
