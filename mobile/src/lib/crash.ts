import * as Sentry from '@sentry/react-native';
import type { ComponentType } from 'react';

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;

interface ErrorUtilsLike {
  getGlobalHandler?: () => GlobalHandler;
  setGlobalHandler: (handler: GlobalHandler) => void;
}

const DSN = (process.env.EXPO_PUBLIC_SENTRY_DSN ?? '').trim();

let started = false;

export function crashReportingEnabled(): boolean {
  return DSN.length > 0;
}

export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}

export function reportError(
  value: unknown,
  context?: Record<string, unknown>
): void {
  const error = toError(value);
  if (crashReportingEnabled()) {
    Sentry.captureException(error, context ? { extra: context } : undefined);
    return;
  }
  console.error(`[crash] ${error.message}`, context ?? {});
}

// last-resort JS handler when sentry is off
function installFallbackHandler(): void {
  const host = globalThis as { ErrorUtils?: ErrorUtilsLike };
  const errorUtils = host.ErrorUtils;
  if (!errorUtils) return;
  const previous = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error, isFatal) => {
    reportError(error, { fatal: Boolean(isFatal) });
    previous?.(error, isFatal);
  });
}

export function initCrashReporter(): void {
  if (started) return;
  started = true;

  if (!crashReportingEnabled()) {
    installFallbackHandler();
    return;
  }

  try {
    Sentry.init({ dsn: DSN, tracesSampleRate: 0 });
  } catch (error) {
    installFallbackHandler();
    console.warn(`[crash] sentry init failed: ${toError(error).message}`);
  }
}

type RootComponent = ComponentType<Record<string, unknown>>;

export function wrap(component: RootComponent): RootComponent {
  if (!crashReportingEnabled()) return component;
  return Sentry.wrap(component);
}
