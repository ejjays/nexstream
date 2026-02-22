const MAX_CONCURRENT_WEIGHT = 1;
let activeWeight = 0;
const processQueue = [];

function acquireLock(weight = 1) {
    return new Promise(resolve => {
        if (activeWeight + weight <= MAX_CONCURRENT_WEIGHT) {
            activeWeight += weight;
            resolve();
        } else {
            processQueue.push({
                resolve,
                weight
            });
        }
    });
}

function releaseLock(weight = 1) {
    activeWeight -= weight;
    while (processQueue.length > 0 && (activeWeight + processQueue[0].weight <= MAX_CONCURRENT_WEIGHT)) {
        const next = processQueue.shift();
        activeWeight += next.weight;
        next.resolve();
    }
}

module.exports = {
    acquireLock,
    releaseLock
};
