import { Response } from 'express';
import { SSEEvent } from '../../types/index.js';

const clients = new Map<string, Response>();
const eventBuffer = new Map<string, SSEEvent[]>();

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

  res.write('retry: 10000\n\n');
  clients.set(id, res);

  // flush buffer
  const buffer = eventBuffer.get(id);
  if (buffer) {
    buffer.forEach((event) => sendEvent(id, event));
    eventBuffer.delete(id);
  }

  res.on('close', () => removeClient(id));
}

export function removeClient(id: string) {
  clients.delete(id);
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
    setTimeout(() => {
      const currentBuffer = eventBuffer.get(id);
      if (currentBuffer) {
        const index = currentBuffer.indexOf(event as SSEEvent);
        if (index > -1) currentBuffer.splice(index, 1);
        if (currentBuffer.length === 0) eventBuffer.delete(id);
      }
    }, 30000);
  }
}

export function sendBufferedEvent(id: string, event: SSEEvent) {
  // throttled progress
  sendEvent(id, event);
}
