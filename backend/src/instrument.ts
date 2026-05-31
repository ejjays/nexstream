import * as Sentry from '@sentry/node'; // skipcq: JS-C1003
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [nodeProfilingIntegration()],
  // sample 10% of traces; errors still 100%
  tracesSampleRate: 0.1,
  profilesSampleRate: 0.1,
  sendDefaultPii: false,
});

process.on('uncaughtException', async (error) => {
  console.error('[Uncaught Exception]', error);
  Sentry.captureException(error);
  await Sentry.close(2000);
  throw error;
});

process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason);
  Sentry.captureException(reason);
});
