import { it, describe, expect } from 'vitest';
import { resolveAndValidateHost } from '../../src/utils/network/security.util.js';

describe('SSRF Protection', () => {
  it('should block private IP ranges', async () => {
    const privateIps = ['127.0.0.1', '192.168.1.1', '10.0.0.1', '172.16.0.1'];
    for (const ip of privateIps) {
      await expect(resolveAndValidateHost(ip)).rejects.toThrow('SSRF Blocked');
    }
  });

  it('should allow public IP ranges', async () => {
    const publicIps = ['8.8.8.8', '1.1.1.1'];
    for (const ip of publicIps) {
      const result = await resolveAndValidateHost(ip);
      expect(result).toBe(ip);
    }
  });
});
