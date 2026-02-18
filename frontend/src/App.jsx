import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import DocsLayout from './components/docs/DocsLayout.jsx';
import MainContent from './components/MainContent.jsx';
import FormatGuide from './pages/Guide/FormatGuide.jsx';
import AboutPage from './pages/About/AboutPage.jsx';

const App = () => {
  return (
    <Router>
      <title>NexStream | 4K Youtube & Spotify Converter</title>
      <meta name="description" content="Best Youtube converter and Spotify downloader. Support TikTok, Instagram, and Facebook. Download in 4K or MP3 high quality for free." />
      
      <Routes>
        {/* Main App Layout */}
        <Route path="/" element={
          <Layout>
            <MainContent />
          </Layout>
        } />

        {/* Documentation Portal Layout */}
        <Route path="/guide/formats" element={
          <DocsLayout>
            <FormatGuide />
          </DocsLayout>
        } />

        <Route path="/about" element={
          <DocsLayout>
            <AboutPage />
          </DocsLayout>
        } />

        {/* Catch-all route to redirect to home */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
};

export default App;
