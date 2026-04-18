const { createSession } = require('better-sse');
const Redis = require('ioredis');

const sessions = new Map();

// redis setup
const isExternal =
  process.env.REDIS_URL &&
  (process.env.REDIS_URL.includes('upstash.io') ||
    process.env.REDIS_URL.includes('aivencloud.com') ||
    process.env.REDIS_URL.includes('valkey'));

const redisOptions = {
  tls: isExternal
    ? {
        rejectUnauthorized: false
      }
    : undefined
};

const pub = new Redis(
  process.env.REDIS_URL || 'redis://localhost:6379',
  redisOptions
);
const sub = new Redis(
  process.env.REDIS_URL || 'redis://localhost:6379',
  redisOptions
);

const CHANNEL = 'sse-events';
const messageBuffer = new Map();

// global events
sub.subscribe(CHANNEL, err => {
  if (err) {
    console.error('[SSE] Failed to subscribe to Redis channel:', err.message);
  }
});

sub.on('message', (channel, message) => {
  if (channel === CHANNEL) {
    try {
      const { id, data } = JSON.parse(message);
      const session = sessions.get(id);
      if (session) {
        console.log(`[SSE] Push to ${id}: ${data.status || data.details || 'update'}`);
        session.push(data);
      } else {
        // buffer message for 5 seconds
        if (!messageBuffer.has(id)) {
          messageBuffer.set(id, []);
          setTimeout(() => messageBuffer.delete(id), 5000);
        }
        messageBuffer.get(id).push(data);
      }
    } catch (e) {
      console.error('[SSE] Error processing Redis message:', e);
    }
  }
});

async function addClient(id, res) {
  const req = res.req;

  // bypass proxy buffering
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform, private, no-store, max-age=0',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff',
    'Content-Encoding': 'identity',
    'Transfer-Encoding': 'chunked'
  });

  // send headers now
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const session = await createSession(req, res);
  
  // force stream flush
  session.push({ 
    type: 'handshake', 
    padding: ' '.repeat(16384) 
  });
  
  if (typeof res.flush === 'function') res.flush();
  
  session.keepAlive();

  sessions.set(id, session);

  // flush message buffer
  const buffered = messageBuffer.get(id);
  if (buffered) {
    console.log(`[SSE] Flushing ${buffered.length} buffered messages for ${id}`);
    buffered.forEach(data => session.push(data));
    messageBuffer.delete(id);
  }

  session.on('disconnected', () => {
    if (sessions.get(id) === session) {
      sessions.delete(id);
    }
  });
}

function removeClient(id) {
  const session = sessions.get(id);
  if (session) {
    if (typeof session.end === 'function') {
      session.end();
    }
    sessions.delete(id);
  }
}

// publish event
function sendEvent(id, data) {
  const payload = JSON.stringify({ id, data });
  pub.publish(CHANNEL, payload);
}

module.exports = {
  addClient,
  removeClient,
  sendEvent
};
