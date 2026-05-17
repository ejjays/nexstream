import { downloadQueue } from '../../utils/queue.util.js';

export async function acquireLock(weight = 1): Promise<unknown> {
    return await downloadQueue.add('lock', { weight });
}

export function releaseLock(_weight = 1): void {
    // BullMQ managed lifecycle
}
