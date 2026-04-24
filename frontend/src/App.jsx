import React, { useLayoutEffect, useEffect, useRef } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";
import { useRemixStore } from "./store/useRemixStore";
import { getDynamicBackendUrl } from "./lib/config";
import { SSEService } from "./lib/sse.service";
import { handleSseMessage } from "./hooks/useSSE";
import Layout from "./components/Layout.jsx";
import DocsLayout from "./components/docs/DocsLayout.jsx";
import MainContent from "./components/MainContent.jsx";
import SongKeyChanger from "./pages/Tools/SongKeyChanger.jsx";
import RemixLab from "./pages/Tools/RemixLab.jsx";
import FormatGuide from "./pages/Guide/FormatGuide.jsx";
import AboutPage from "./pages/About/AboutPage.jsx";
import SecurityPrivacy from "./pages/Guide/SecurityPrivacy.jsx";
import VideoGuide from "./pages/Guide/VideoGuide.jsx";
import ArchitectureDeepDive from "./pages/Guide/ArchitectureDeepDive.jsx";
import TechStack from "./pages/Guide/TechStack.jsx";
import RemixLabGuide from "./pages/Guide/RemixLabGuide.jsx";

const ScrollToTop = () => {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    const mainContent = document.querySelector("main");
    if (mainContent) {
      mainContent.scrollTo(0, 0);
    }
  }, [pathname]);

  return null;
};

const App = () => {
  const backendUrl = useRemixStore((state) => state.backendUrl);
  const setBackendUrl = useRemixStore((state) => state.setBackendUrl);
  const clientId = useRemixStore((state) => state.clientId);
  const sessionStartTime = useRemixStore((state) => state.sessionStartTime);
  const setSessionStartTime = useRemixStore((state) => state.setSessionStartTime);
  
  const sseRef = useRef(null);

  // set remote url
  useEffect(() => {
    let mounted = true;
    getDynamicBackendUrl().then((url) => {
      if (url && mounted) setBackendUrl(url);
    });
    return () => { mounted = false; };
  }, [setBackendUrl]);

  // handle sse connection
  useEffect(() => {
    if (!backendUrl || !clientId) return;
    if (sseRef.current) return;

    const sse = new SSEService();
    sseRef.current = sse;
    let mounted = true;
    let reconnectTimeout = null;

    const connect = async () => {
      if (!mounted) return;
      
      try {
        await sse.connect(
          `${backendUrl}/events?id=${clientId}`,
          (data) => {
            if (!mounted) return;
            
            // track session start in store if not set
            if ((data.status === 'fetching_info' || data.status === 'initializing') && !useRemixStore.getState().sessionStartTime) {
              useRemixStore.getState().setSessionStartTime(Date.now());
            }

            handleSseMessage(data, '', {
              setStatus: (s) => useRemixStore.getState().setStatus(s),
              setVideoData: (v) => useRemixStore.getState().setVideoData(v),
              setIsPickerOpen: (o) => useRemixStore.getState().setIsPickerOpen(o),
              setPendingSubStatuses: (p) => useRemixStore.getState().setPendingSubStatuses(p),
              setDesktopLogs: useRemixStore.getState().setDesktopLogs,
              setTargetProgress: (tp) => useRemixStore.getState().setTargetProgress(tp),
              setProgress: (p) => useRemixStore.getState().setProgress(p),
              setSubStatus: (ss) => useRemixStore.getState().setSubStatus(ss),
              getTS: () => {
                const start = useRemixStore.getState().sessionStartTime;
                if (!start) return "[0:00]";
                const elapsed = Math.floor((Date.now() - start) / 1000);
                const mins = Math.floor(elapsed / 60);
                const secs = elapsed % 60;
                return `[${mins}:${secs.toString().padStart(2, '0')}]`;
              }
            });
          },
          (err) => {
            if (!mounted) return;
            console.error("[SSE] Error:", err.message);
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            reconnectTimeout = setTimeout(connect, 3000);
          },
          () => {
            if (!mounted) return;
            console.log("[SSE] Connected");
          }
        );
        
        // fix reconnect loop
      } catch (e) {
        if (mounted) {
          if (reconnectTimeout) clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(connect, 3000);
        }
      }
    };

    connect();

    return () => {
      mounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      sse.disconnect();
      sseRef.current = null;
    };
  }, [backendUrl, clientId]);

  return (
    <Router>
      <ScrollToTop />
      <title>NexStream | 4K Youtube & Spotify Converter</title>
      <meta
        name="description"
        content="Best Youtube converter and Spotify downloader. Support TikTok, Instagram, and Facebook. Download in 4K or MP3 high quality for free."
      />

      <Routes>
        <Route
          path="/"
          element={
            <Layout>
              <MainContent />
            </Layout>
          }
        />
        <Route
          path="/tools/key-changer"
          element={<SongKeyChanger />}
        />
        <Route
          path="/tools/remix-lab"
          element={<RemixLab onExit={() => window.location.href = '/'} />}
        />

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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

export default App;
