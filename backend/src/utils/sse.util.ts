import { Response } from 'express';
import { createRedisClient } from './redis.util.js';
import { SSEEvent } from '../types/index.js';

interface Session {
  push: (data: SSEEvent) => void;
  keepAlive: () => void;
}

const sessions = new Map<string, Session>();

// redis connections
const pub = createRedisClient('SSE-Pub');
const sub = createRedisClient('SSE-Sub');

const CHANNEL = 'sse-events';
const messageBuffer = new Map<string, SSEEvent[]>();

// global events
sub.subscribe(CHANNEL, (err: Error | null | undefined) => {
  if (err) {
    console.error('[SSE] Failed to subscribe to Redis channel:', err.message);
  }
});

sub.on('message', (channel: string, message: string) => {
  if (channel === CHANNEL) {
    try {
      const parsed = JSON.parse(message) as { id: string; data: SSEEvent };
      const { id, data } = parsed;
      const session = sessions.get(id);
      if (session) {
        session.push(data);
      } else {
        // buffer logs for 10s
        if (!messageBuffer.has(id)) {
          messageBuffer.set(id, []);
          setTimeout(() => messageBuffer.delete(id), 10000);
        }
        messageBuffer.get(id)?.push(data);
      }
    } catch (e: unknown) {
      const error = e as Error;
      console.error('[SSE] Error processing Redis message:', error.message);
    }
  }
});

export async function addClient(id: string, res: Response & { flush?: () => void }) {
  // bypass proxy buffering
  const origin = (res.req.headers.origin as string) || '*';
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform, private, no-store, max-age=0',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff',
    'Content-Encoding': 'identity',
    'Transfer-Encoding': 'chunked',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Last-Event-ID, ngrok-skip-browser-warning, bypass-tunnel-reminder'
  });

  // initial proxy flush
  res.write(': ' + ' '.repeat(16384) + '\n\n');
  res.flush?.();

  const session: Session = {
    push: (data: SSEEvent) => {
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        res.flush?.();
      } catch (e: unknown) {
        const error = e as Error;
        console.debug('[SSEUtil] Event push error:', error.message);
      }
    },
    keepAlive: () => {
      const interval = setInterval(() => {
        try {
          res.write(': keep-alive\n\n');
          res.flush?.();
        } catch (e: unknown) {
          const error = e as Error;
          console.debug('[SSEUtil] Keep-alive error:', error.message);
        }
      }, 15000);
      res.on('close', () => clearInterval(interval));
    }
  };

  session.keepAlive();
  
  // session persistence
  sessions.set(id, session);

  // flush message buffer
  const buffered = messageBuffer.get(id);
  if (buffered) {
    buffered.forEach(data => session.push(data));
    messageBuffer.delete(id);
  }

  // safe disconnect handler
  res.on('close', () => {
    if (sessions.get(id) === session) {
      sessions.delete(id);
    }
  });
}

export function removeClient(id: string) {
  // manual removal
  sessions.delete(id);
}

// publish event
export function sendEvent(id: string, data: SSEEvent) {
  const payload = JSON.stringify({ id, data });
  pub.publish(CHANNEL, payload);
}
