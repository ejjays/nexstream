const clients = new Map();

function addClient(id, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    clients.set(id, res);
}

function removeClient(id) {
    clients.delete(id);
}

function sendEvent(id, data) {
    const client = clients.get(id);
    if (client) {
        client.write(`data: ${JSON.stringify(data)}

`);
    }
}

module.exports = {
    addClient,
    removeClient,
    sendEvent
};
