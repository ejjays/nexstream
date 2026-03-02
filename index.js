const http = require('http');
const net = require('net');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  if (req.url === '/ping' || req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Proxy Bridge is Healthy');
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const target = req.url.slice(1); // /target.com:443 -> target.com:443
  if (!target) {
    ws.close();
    return;
  }

  const [host, port] = target.split(':');
  console.log(`[Bridge] Tunneling to ${host}:${port}`);

  const serviceSocket = net.connect({
    host: host,
    port: parseInt(port) || 443,
    family: 4 
  }, () => {
    // Standard piping using the WebSocket stream wrapper
    // This handles backpressure and binary data correctly
    const wsStream = WebSocket.createWebSocketStream(ws, { encoding: 'binary' });
    
    wsStream.pipe(serviceSocket);
    serviceSocket.pipe(wsStream);
  });

  serviceSocket.on('error', (err) => {
    console.error(`[Bridge] Socket Error: ${err.message}`);
    ws.close();
  });
  
  ws.on('error', (err) => {
    console.error(`[Bridge] WS Error: ${err.message}`);
    serviceSocket.end();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`WebSocket Bridge listening on port ${PORT}`);
});