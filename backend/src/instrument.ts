import * as Sentry from '@sentry/node'; // skipcq: JS-C1003

// skip profiler to save instance resources
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
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
