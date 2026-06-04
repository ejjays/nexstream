import * as Sentry from '@sentry/node'; // skipcq: JS-C1003

type ProfilingIntegration = ReturnType<
  (typeof import('@sentry/profiling-node'))['nodeProfilingIntegration']
>;

// skip profiler if native binding missing
const integrations: ProfilingIntegration[] = [];
try {
  const { nodeProfilingIntegration } = await import('@sentry/profiling-node');
  integrations.push(nodeProfilingIntegration());
} catch (error) {
  console.warn(
    '[Sentry] CPU profiler unavailable:',
    error instanceof Error ? error.message : String(error)
  );
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations,
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
