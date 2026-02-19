import React, { useEffect, useLayoutEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import DocsLayout from './components/docs/DocsLayout.jsx';
import MainContent from './components/MainContent.jsx';
import FormatGuide from './pages/Guide/FormatGuide.jsx';
import AboutPage from './pages/About/AboutPage.jsx';
import SecurityPrivacy from './pages/Guide/SecurityPrivacy.jsx';
import VideoGuide from './pages/Guide/VideoGuide.jsx';

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

const App = () => {
  return (
    <Router>
      <ScrollToTop />
      <title>NexStream | 4K Youtube & Spotify Converter</title>
      <meta name="description" content="Best Youtube converter and Spotify downloader. Support TikTok, Instagram, and Facebook. Download in 4K or MP3 high quality for free." />
      
      <Routes>
        {/* Main App Layout */}
        <Route path="/" element={
          <Layout>
            <MainContent />
          </Layout>
        } />

        {/* Documentation Portal Layout Wrapper */}
        <Route element={<DocsLayout><Outlet /></DocsLayout>}>
          <Route path="/guide/formats" element={<FormatGuide />} />
          <Route path="/guide/video" element={<VideoGuide />} />
          <Route path="/guide/security" element={<SecurityPrivacy />} />
          <Route path="/about" element={<AboutPage />} />
        </Route>

        {/* Catch-all route to redirect to home */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
};

export default App;
