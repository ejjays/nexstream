import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react'; // skipcq: JS-C1003
import './index.css';
import App from './App';
import { initAV1Support } from './lib/codec-support';

// kick off async av1 capability probe
initAV1Support();

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN.trim(),
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 1.0,
    tracePropagationTargets: [
      'localhost',
      /^\//,
      import.meta.env.VITE_API_URL || '',
    ],
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 0.1,
    sendDefaultPii: true,
  });
}

let refreshing = false;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find root element');

createRoot(rootElement).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={<p>Something went wrong. Please refresh the page.</p>}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </StrictMode>
);
