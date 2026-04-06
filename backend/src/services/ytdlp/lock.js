const { downloadQueue } = require('../../utils/queue.util');

// BullMQ-powered shim
module.exports = { 
  acquireLock: async (weight = 1) => {
    // persistently queue lock
    return await downloadQueue.add('lock', { weight });
  },
  releaseLock: (weight = 1) => {
    // managed by BullMQ lifecycle
  }
};
