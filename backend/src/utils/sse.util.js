const clients = new Map();

function addClient(id, res) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Credentials", "true");

    res.flushHeaders();

    res.write(": ok\n\n");

    clients.set(id, res);

    const heartbeat = setInterval(() => {
        if (!res.writableEnded) {
            res.write(": heartbeat\n\n");
        }
    }, 20000);

    res.heartbeat = heartbeat;
}

function removeClient(id) {
    const res = clients.get(id);
    if (res && res.heartbeat) {
        clearInterval(res.heartbeat);
    }
    clients.delete(id);
}

function sendEvent(id, data) {
    const client = clients.get(id);
    if (client) {
        client.write(`data: ${JSON.stringify(data)}\n\n`);
    } else
        {}
}

module.exports = {
    addClient,
    removeClient,
    sendEvent
};
