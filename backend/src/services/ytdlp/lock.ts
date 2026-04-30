import { downloadQueue } from '../../utils/queue.util.js';

export async function acquireLock(weight: number = 1): Promise<any> {
    return await downloadQueue.add('lock', { weight });
}

export function releaseLock(weight: number = 1): void {
    // managed by BullMQ lifecycle
}
