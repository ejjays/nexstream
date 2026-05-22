import pino from 'pino';
import { getTraceId } from './trace.util.js';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  mixin() {
    const traceId = getTraceId();
    return traceId ? { traceId } : {};
  },
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'SYS:standard',
    },
  } : undefined,
});