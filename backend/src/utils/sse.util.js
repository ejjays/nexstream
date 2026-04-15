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
        session.push(data);
      }
    } catch (e) {
      console.error('[SSE] Error processing Redis message:', e);
    }
  }
});

async function addClient(id, res) {
  // clear session
  removeClient(id);

  const req = res.req;

  // disable buffering for proxies (Vercel, Cloudflare...)
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Content-Encoding', 'none');

  const session = await createSession(req, res);

  sessions.set(id, session);

  session.on('disconnected', () => {
    sessions.delete(id);
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
