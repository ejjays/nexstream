import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [nodeProfilingIntegration()],
  // tracing
  tracesSampleRate: 1.0, // capture all

  // profiling rate
  profilesSampleRate: 1.0,
});

process.on('uncaughtException', (error) => {
  console.error('[Uncaught Exception]', error);
  Sentry.captureException(error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason);
  Sentry.captureException(reason);
});
