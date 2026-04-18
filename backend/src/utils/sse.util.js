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
        session.push(data);
      } else {
        // buffer logs for 10s
        if (!messageBuffer.has(id)) {
          messageBuffer.set(id, []);
          setTimeout(() => messageBuffer.delete(id), 10000);
        }
        messageBuffer.get(id).push(data);
      }
    } catch (e) {
      console.error('[SSE] Error processing Redis message:', e);
    }
  }
});

async function addClient(id, res) {
  // bypass proxy buffering
  const origin = res.req.headers.origin || '*';
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
  if (typeof res.flush === 'function') res.flush();

  const session = {
    push: (data) => {
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        if (typeof res.flush === 'function') res.flush();
      } catch (e) {}
    },
    keepAlive: () => {
      const interval = setInterval(() => {
        try {
          res.write(': keep-alive\n\n');
          if (typeof res.flush === 'function') res.flush();
        } catch (e) {}
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

function removeClient(id) {
  // manual removal
  sessions.delete(id);
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
