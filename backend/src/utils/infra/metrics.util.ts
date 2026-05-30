import type { Request, Response, NextFunction } from 'express';

// in-memory observability; resets on restart
interface RouteStat {
  count: number;
  errors: number;
  totalMs: number;
  maxMs: number;
}

export interface MetricsSnapshot {
  uptimeSec: number;
  totalRequests: number;
  totalErrors: number;
  routes: Record<
    string,
    { count: number; errors: number; avgMs: number; maxMs: number }
  >;
  failures: Record<string, number>;
}

// bound label cardinality against abuse
const MAX_LABELS = 200;
const startedAt = Date.now();
const routes = new Map<string, RouteStat>();
const failures = new Map<string, number>();

// fold overflow keys into "other"
function capKey(store: Map<string, unknown>, rawKey: string): string {
  if (store.has(rawKey) || store.size < MAX_LABELS) {
    return rawKey;
  }
  return 'other';
}

export function recordRequest(
  label: string,
  statusCode: number,
  durationMs: number
): void {
  const key = capKey(routes, label);
  const stat = routes.get(key) ?? {
    count: 0,
    errors: 0,
    totalMs: 0,
    maxMs: 0,
  };
  stat.count += 1;
  if (statusCode >= 500) {
    stat.errors += 1;
  }
  stat.totalMs += durationMs;
  if (durationMs > stat.maxMs) {
    stat.maxMs = durationMs;
  }
  routes.set(key, stat);
}

export function recordFailure(reason: string): void {
  const key = capKey(failures, reason);
  failures.set(key, (failures.get(key) ?? 0) + 1);
}

export function getMetrics(): MetricsSnapshot {
  const perRoute: MetricsSnapshot['routes'] = {};
  let totalRequests = 0;
  let totalErrors = 0;
  for (const [label, stat] of routes) {
    totalRequests += stat.count;
    totalErrors += stat.errors;
    perRoute[label] = {
      count: stat.count,
      errors: stat.errors,
      avgMs: Math.round(stat.totalMs / stat.count),
      maxMs: stat.maxMs,
    };
  }
  return {
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    totalRequests,
    totalErrors,
    routes: perRoute,
    failures: Object.fromEntries(failures),
  };
}

export function resetMetrics(): void {
  routes.clear();
  failures.clear();
}

// record latency + outcome per request
export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // skip long-lived SSE stream
  if (req.path === '/events') {
    next();
    return;
  }
  const start = Date.now();
  res.on('finish', () => {
    recordRequest(
      `${req.method} ${req.path}`,
      res.statusCode,
      Date.now() - start
    );
  });
  next();
}
