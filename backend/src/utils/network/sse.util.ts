import { Response } from 'express';
import { SSEEvent } from '../../types/index.js';

const clients = new Map<string, Response>();
const eventBuffer = new Map<string, SSEEvent[]>();
let heartbeatInterval: NodeJS.Timeout | null = null;

function startHeartbeat() {
  if (heartbeatInterval) return;
  heartbeatInterval = setInterval(() => {
    clients.forEach((client, id) => {
      try {
        client.write(': heartbeat\n\n');
      } catch (err) {
        console.debug(
          '[SSE] Heartbeat failed, removing client',
          id,
          (err as Error).message
        );
        removeClient(id);
      }
    });
  }, 10000); // 10s heartbeat interval
  // unref keep-alive
  heartbeatInterval.unref?.();
}

export function addClient(id: string, res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable buffering

  // sse cors
  const origin = res.getHeader('Access-Control-Allow-Origin') as string;
  res.writeHead(200, {
    'Access-Control-Allow-Origin': origin || '*',
  });

  res.write('retry: 5000\n\n');
  clients.set(id, res);

  startHeartbeat();

  // flush buffer
  const buffer = eventBuffer.get(id);
  if (buffer) {
    buffer.forEach((event) => {
      sendEvent(id, event);
    });
    eventBuffer.delete(id);
  }

  res.on('close', () => removeClient(id));
}

export function removeClient(id: string) {
  clients.delete(id);
  if (clients.size === 0 && heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

export function sendEvent(
  id: string,
  event: SSEEvent | Record<string, unknown>
) {
  const client = clients.get(id);
  if (client) {
    try {
      client.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (error) {
      console.error('[SSE] Write failed:', (error as Error).message);
      removeClient(id);
    }
  } else {
    // 30s buffer
    const buffer = eventBuffer.get(id) || [];
    buffer.push(event as SSEEvent);
    eventBuffer.set(id, buffer);
    const bufferTimer = setTimeout(() => {
      const currentBuffer = eventBuffer.get(id);
      if (currentBuffer) {
        const index = currentBuffer.indexOf(event as SSEEvent);
        if (index > -1) currentBuffer.splice(index, 1);
        if (currentBuffer.length === 0) eventBuffer.delete(id);
      }
    }, 30000);
    bufferTimer.unref?.();
  }
}

export function sendBufferedEvent(id: string, event: SSEEvent) {
  // throttled progress
  sendEvent(id, event);
}

export function resetSSE() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  clients.clear();
  eventBuffer.clear();
}
