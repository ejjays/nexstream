import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import 'dotenv/config';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN.trim(),
    integrations: [
      nodeProfilingIntegration(),
    ],
    // production performance
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    tracesSampler: (samplingContext) => {
      if (samplingContext.name === 'GET /ping' || samplingContext.name === 'GET /health') {
        return 0;
      }
      return process.env.NODE_ENV === 'production' ? 0.1 : 1.0;
    }
  });
  console.log('[Sentry] Backend Instrumentation Initialized');
} else {
  console.warn('[Sentry] Backend DSN not found in environment');
}
