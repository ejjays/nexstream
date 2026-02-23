import React, { useLayoutEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";
import Layout from "./components/Layout.jsx";
import DocsLayout from "./components/docs/DocsLayout.jsx";
import MainContent from "./components/MainContent.jsx";
import FormatGuide from "./pages/Guide/FormatGuide.jsx";
import AboutPage from "./pages/About/AboutPage.jsx";
import SecurityPrivacy from "./pages/Guide/SecurityPrivacy.jsx";
import VideoGuide from "./pages/Guide/VideoGuide.jsx";
import ArchitectureDeepDive from "./pages/Guide/ArchitectureDeepDive.jsx";
import TechStack from "./pages/Guide/TechStack.jsx";

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
