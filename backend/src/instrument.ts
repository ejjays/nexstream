import * as Sentry from '@sentry/node';
import 'dotenv/config';

async function initSentry() {
  if (!process.env.SENTRY_DSN) {
    console.warn('[Sentry] Backend DSN not found in environment');
    return;
  }

  const isAndroid = process.platform === 'android';
  const integrations = [];

  if (!isAndroid) {
    try {
      // dynamic import
      const { nodeProfilingIntegration } =
        await import('@sentry/profiling-node');
      integrations.push(nodeProfilingIntegration());
    } catch (e) {
      console.warn(
        '[Sentry] Profiling integration skipped:',
        (e as Error).message
      );
    }
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN.trim(),
    integrations,
    // production performance
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    tracesSampler: (samplingContext) => {
      if (
        samplingContext.name === 'GET /ping' ||
        samplingContext.name === 'GET /health'
      ) {
        return 0;
      }
      return process.env.NODE_ENV === 'production' ? 0.1 : 1.0;
    },
  });
  console.log(
    `[Sentry] Backend Instrumentation Initialized (Profiling: ${!isAndroid})`
  );
}

initSentry();
