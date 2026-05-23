import React, {
  useLayoutEffect,
  useEffect,
  useRef,
  useCallback,
  lazy,
  Suspense,
} from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useRemixStore } from './store/useRemixStore';
import { VideoInfo } from '@shared/schemas/media.schema.js';
import { getDynamicBackendUrl } from './lib/config';
import { SSEService } from './lib/sse.service';
import { handleSseMessage } from './hooks/useSSE';
import Layout from './components/Layout';

// lazy load pages
const DocsLayout = lazy(() => import('./components/docs/DocsLayout'));
const MainContent = lazy(() => import('./components/MainContent'));
const SongKeyChanger = lazy(() => import('./pages/Tools/SongKeyChanger'));
const RemixLab = lazy(() => import('./pages/Tools/RemixLab'));
const FormatGuide = lazy(() => import('./pages/Guide/FormatGuide'));
const AboutPage = lazy(() => import('./pages/About/AboutPage'));
const SecurityPrivacy = lazy(() => import('./pages/Guide/SecurityPrivacy'));
const VideoGuide = lazy(() => import('./pages/Guide/VideoGuide'));
const ArchitectureDeepDive = lazy(
  () => import('./pages/Guide/ArchitectureDeepDive')
);
const TechStack = lazy(() => import('./pages/Guide/TechStack'));
const RemixLabGuide = lazy(() => import('./pages/Guide/RemixLabGuide'));
const NotFound = lazy(() => import('./pages/NotFound'));

const ScrollToTop = () => {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    const mainContent = document.querySelector('main');
    if (mainContent) {
      mainContent.scrollTo(0, 0);
    }
  }, [pathname]);

  return null;
};

const RemixLabRoute = () => {
  const handleExit = useCallback(() => {
    window.location.href = '/';
  }, []);

  return <RemixLab onExit={handleExit} />;
};

const App = () => {
  const backendUrl = useRemixStore((state) => state.backendUrl);
  const setBackendUrl = useRemixStore((state) => state.setBackendUrl);
  const clientId = useRemixStore((state) => state.clientId);
  const location = useLocation();

  const sseRef = useRef<SSEService | null>(null);

  // set remote url
  useEffect(() => {
    let mounted = true;
    console.log('[App] initiating backend discovery...');
    getDynamicBackendUrl().then((url) => {
      if (url && mounted) setBackendUrl(url);
    });
    return () => {
      mounted = false;
    };
  }, [setBackendUrl]);

  // handle sse connection
  useEffect(
    function () {
      if (!backendUrl || !clientId) return;

      // disconnect SSE
      if (location.pathname.includes('/tools/remix-lab')) {
        if (sseRef.current) {
          sseRef.current.disconnect();
          sseRef.current = null;
        }
        return;
      }

      if (sseRef.current) return;

      const sse = new SSEService();
      sseRef.current = sse;
      let mounted = true;
      let reconnectTimeout: number | null = null;

      const connect = async () => {
        if (!mounted) return;

        try {
          await sse.connect(
            `${backendUrl}/events?id=${clientId}`,
            (data: unknown) => {
              if (!mounted) return;

              const event = data as { status?: string };
              // track session start
              if (
                (event.status === 'fetching_info' ||
                  event.status === 'initializing') &&
                !useRemixStore.getState().sessionStartTime
              ) {
                useRemixStore.getState().setSessionStartTime(Date.now());
              }

              handleSseMessage(data as Record<string, unknown>, '', {
                setStatus: (s: string) => useRemixStore.getState().setStatus(s),
                setVideoData: (v: unknown) =>
                  useRemixStore.getState().setVideoData(v as VideoInfo),
                setIsPickerOpen: (o: boolean) =>
                  useRemixStore.getState().setIsPickerOpen(o),
                setPendingSubStatuses: (p: unknown) =>
                  useRemixStore
                    .getState()
                    .setPendingSubStatuses(p as unknown[]),
                setDesktopLogs: useRemixStore.getState().setDesktopLogs,
                setTargetProgress: (tp: unknown) =>
                  useRemixStore.getState().setTargetProgress(tp as number),
                setProgress: (p: unknown) =>
                  useRemixStore.getState().setProgress(p as number),
                setSubStatus: (ss: string) =>
                  useRemixStore.getState().setSubStatus(ss),
                getTS: () => {
                  const start = useRemixStore.getState().sessionStartTime;
                  if (!start) return '[0:00]';
                  const elapsed = Math.floor((Date.now() - start) / 1000);
                  const mins = Math.floor(elapsed / 60);
                  const secs = elapsed % 60;
                  return `[${mins}:${secs.toString().padStart(2, '0')}]`;
                },
              });
            },
            (err: unknown) => {
              if (!mounted) return;
              const error = err as { message?: string };
              console.error('[SSE] Error:', error.message);
              if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
              reconnectTimeout = window.setTimeout(connect, 3000);
            },
            () => {
              if (!mounted) return;
              console.log('[SSE] Connected');
            }
          );
        } catch (_e) {
          if (mounted) {
            if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
            reconnectTimeout = window.setTimeout(connect, 3000);
          }
        }
      };

      function initSse(): void {
        connect();
      }
      initSse();

      return () => {
        mounted = false;
        if (reconnectTimeout) {
          window.clearTimeout(reconnectTimeout);
        }
        sse.disconnect();
        sseRef.current = null;
      };
    },
    [backendUrl, clientId, location.pathname]
  );

  return (
    <>
      <ScrollToTop />
      <Suspense fallback={null}>
        <Routes>
          <Route
            path="/"
            element={
              <Layout>
                <MainContent />
              </Layout>
            }
          />
          <Route path="/tools/key-changer" element={<SongKeyChanger />} />
          <Route path="/tools/remix-lab" element={<RemixLabRoute />} />

          <Route
            element={
              <DocsLayout>
                <Outlet />
              </DocsLayout>
            }
          >
            <Route path="/resources/story" element={<AboutPage />} />
            <Route
              path="/resources/architecture"
              element={<ArchitectureDeepDive />}
            />
            <Route path="/resources/stack" element={<TechStack />} />
            <Route path="/resources/audio-guide" element={<FormatGuide />} />
            <Route path="/resources/video-guide" element={<VideoGuide />} />
            <Route path="/resources/security" element={<SecurityPrivacy />} />
            <Route path="/resources/remix-guide" element={<RemixLabGuide />} />
          </Route>

          <Route
            path="/about"
            element={<Navigate to="/resources/story" replace />}
          />
          <Route
            path="/guide/architecture"
            element={<Navigate to="/resources/architecture" replace />}
          />
          <Route
            path="/guide/formats"
            element={<Navigate to="/resources/audio-guide" replace />}
          />
          <Route
            path="/guide/video"
            element={<Navigate to="/resources/video-guide" replace />}
          />
          <Route
            path="/guide/security"
            element={<Navigate to="/resources/security" replace />}
          />
          <Route
            path="/guide/stack"
            element={<Navigate to="/resources/stack" replace />}
          />

          <Route
            path="/docs/story"
            element={<Navigate to="/resources/story" replace />}
          />
          <Route
            path="/docs/architecture"
            element={<Navigate to="/resources/architecture" replace />}
          />
          <Route
            path="/docs/audio-guide"
            element={<Navigate to="/resources/audio-guide" replace />}
          />
          <Route
            path="/docs/video-guide"
            element={<Navigate to="/resources/video-guide" replace />}
          />
          <Route
            path="/docs/security"
            element={<Navigate to="/resources/security" replace />}
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
};

export default App;
