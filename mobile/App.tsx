import { useState, useRef, useEffect, useCallback } from 'react';
import { View, StatusBar, AppState, InteractionManager } from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import tw from './src/lib/tw';
import DotPattern, { useDotTouch } from './src/components/DotPattern';
import ShootingStars from './src/components/ShootingStars';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BottomNav from './src/components/BottomNav';
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import UpdatesScreen from './src/screens/UpdatesScreen';
import { type DownloadMode } from './src/components/FormatBar';
import { resolve } from './src/extractors';
import { prewarmClientId } from './src/extractors/soundcloud';
import { Format, VideoInfo, ExtractorError } from './src/extractors/types';
import PickerModal from './src/components/PickerModal';
import NotificationPermissionSheet from './src/components/NotificationPermissionSheet';
import DownloadSuccessSheet from './src/components/DownloadSuccessSheet';
import ErrorSheet from './src/components/ErrorSheet';
import YouTubeExtractorWebView from './src/components/YouTubeExtractorWebView';
import ErrorBoundary from './src/components/ErrorBoundary';
import { type DownloadMeta } from './src/lib/format';
import { getStringAsync as getClipboardText } from 'expo-clipboard';
import {
  getAutoPaste,
  getNotify,
  getNotifyPrimed,
  setNotifyPrimed,
} from './src/lib/settings';
import { addDownloadTapListener, enableNotifications } from './src/lib/notify';
import { registerDownloadService } from './src/lib/fgservice';
import { openSavedTarget } from './src/lib/gallery';
import { useDownload } from './src/hooks/useDownload';
import { tapImpact, loadHaptics } from './src/lib/haptics';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import IBMPlexMonoRegular from './assets/fonts/IBMPlexMono-Regular.ttf';
import IBMPlexMonoMedium from './assets/fonts/IBMPlexMono-Medium.ttf';
import IBMPlexMonoSemiBold from './assets/fonts/IBMPlexMono-SemiBold.ttf';
import IBMPlexMonoBold from './assets/fonts/IBMPlexMono-Bold.ttf';
import RubikRegular from './assets/fonts/Rubik-Regular.ttf';
import RubikMedium from './assets/fonts/Rubik-Medium.ttf';
import RubikSemiBold from './assets/fonts/Rubik-SemiBold.ttf';
import RubikBold from './assets/fonts/Rubik-Bold.ttf';

const queryClient = new QueryClient();

void SplashScreen.preventAutoHideAsync();

const SUCCESS_HANDOFF_MS = 280;

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
  const [visited, setVisited] = useState({ settings: false, updates: false });
  const [bgReady, setBgReady] = useState(false);
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{
    message: string;
    canRetry: boolean;
  } | null>(null);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const { downloads, startDownload, clearDownloads } = useDownload(info);
  const [mode, setMode] = useState<DownloadMode>('mp4');
  const dismissedRef = useRef(false);
  const { touchX, touchY, active, touchHandlers } = useDotTouch();
  const [refreshing, setRefreshing] = useState(false);
  const [showNotifSheet, setShowNotifSheet] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{
    isAudio: boolean;
    uri?: string;
  }>({ isAudio: false });
  const successRef = useRef<{ isAudio: boolean; uri?: string }>({
    isAudio: false,
  });

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
    prewarmClientId();
    const unsubscribe = addDownloadTapListener(() => {
      void openSavedTarget(successRef.current);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const check = async () => {
      const [primed, already] = await Promise.all([
        getNotifyPrimed(),
        getNotify(),
      ]);
      if (primed) return;
      if (already) {
        void setNotifyPrimed(true);
        return;
      }
      setShowNotifSheet(true);
    };
    void check();
  }, []);

  const allowNotifs = () => {
    setShowNotifSheet(false);
    void setNotifyPrimed(true);
    void enableNotifications().catch(() => undefined);
  };

  const dismissNotifs = () => {
    setShowNotifSheet(false);
    void setNotifyPrimed(true);
  };

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() =>
      setBgReady(true)
    );
    return () => task.cancel();
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
          setError({
            message: 'No video found, or this link is not supported yet.',
            canRetry: true,
          });
        }
        return;
      }
      if (!dismissedRef.current) setInfo(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong.';
      const canRetry = !(e instanceof ExtractorError) || e.retryable;
      console.error(`[Resolve] failed: ${message}`);
      if (!dismissedRef.current) {
        setInfo(null);
        setError({ message, canRetry });
      }
    } finally {
      setLoading(false);
    }
  };

  const closePicker = () => {
    dismissedRef.current = true;
    setInfo(null);
  };

  const onDownload = async (format: Format, meta?: DownloadMeta) => {
    setError(null);
    const result = await startDownload(format, meta);
    if (result.status === 'error') {
      setError({ message: result.message, canRetry: true });
      return;
    }
    if (result.status === 'saved') {
      closePicker();
      const target = {
        isAudio: format.isAudio && !format.isVideo,
        uri: result.uri,
      };
      setSuccessInfo(target);
      successRef.current = target;
      setTimeout(() => setSuccessOpen(true), SUCCESS_HANDOFF_MS);
    }
  };

  const goTab = (next: 'home' | 'settings' | 'updates') => {
    setTab(next);
    if (next === 'settings' || next === 'updates') {
      setVisited((v) => (v[next] ? v : { ...v, [next]: true }));
    }
  };

  const onLayoutRoot = useCallback(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    // skipcq: JS-0415
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={tw`flex-1 bg-background`}>
        <KeyboardProvider>
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <SafeAreaView
              style={tw`flex-1 bg-background`}
              onLayout={onLayoutRoot}
            >
              <StatusBar barStyle="light-content" backgroundColor="#030014" />
              {bgReady && (
                <Animated.View
                  entering={FadeIn.duration(450)}
                  pointerEvents="none"
                  style={tw`absolute inset-0`}
                >
                  <DotPattern touchX={touchX} touchY={touchY} active={active} />
                  {tab === 'home' && <ShootingStars />}
                </Animated.View>
              )}
              <View
                style={[tw`flex-1`, { opacity: tab === 'home' ? 1 : 0 }]}
                pointerEvents={tab === 'home' ? 'auto' : 'none'}
                {...touchHandlers}
              >
                <HomeScreen
                  link={link}
                  onChangeLink={setLink}
                  loading={loading}
                  mode={mode}
                  setMode={setMode}
                  onResolve={handleResolve}
                  onPaste={handlePaste}
                  onInputFocus={() => {
                    active.value = 0;
                  }}
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                />
              </View>
              {visited.settings && (
                <SettingsScreen visible={tab === 'settings'} />
              )}
              {visited.updates && <UpdatesScreen visible={tab === 'updates'} />}
              <BottomNav onChange={goTab} />
              <PickerModal
                info={info}
                downloads={downloads}
                preferAudio={mode === 'mp3' || info?.extractorKey === 'spotify'}
                onClose={closePicker}
                onDownload={onDownload}
              />
              <DownloadSuccessSheet
                open={successOpen}
                onClose={() => setSuccessOpen(false)}
                isAudio={successInfo.isAudio}
                onOpen={() => {
                  void openSavedTarget(successInfo);
                  setSuccessOpen(false);
                }}
              />
              <ErrorSheet
                open={!!error}
                message={error?.message ?? ''}
                onClose={() => setError(null)}
                onRetry={() => {
                  void handleResolve();
                }}
                canRetry={error?.canRetry ?? true}
              />
              <YouTubeExtractorWebView />
              <NotificationPermissionSheet
                visible={showNotifSheet}
                onAllow={allowNotifs}
                onDismiss={dismissNotifs}
              />
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
