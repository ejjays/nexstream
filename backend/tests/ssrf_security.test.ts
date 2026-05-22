import { describe, it, expect } from 'vitest';
import { isSafeIp, resolveAndValidateHost } from '../src/utils/security.util.js';

describe('Security Utility: SSRF Protection', () => {

  describe('isSafeIp()', () => {
    it('blocks loopback (127.x.x.x)', () => {
      expect(isSafeIp('127.0.0.1')).toBe(false);
      expect(isSafeIp('127.1.2.3')).toBe(false);
    });

    it('blocks Class A private (10.x.x.x)', () => {
      expect(isSafeIp('10.0.0.1')).toBe(false);
      expect(isSafeIp('10.255.255.255')).toBe(false);
    });

    it('blocks Class B private (172.16.x.x - 172.31.x.x)', () => {
      expect(isSafeIp('172.16.0.1')).toBe(false);
      expect(isSafeIp('172.31.255.255')).toBe(false);
    });
    
    it('allows public IPs similar to Class B', () => {
      expect(isSafeIp('172.15.0.1')).toBe(true);
      expect(isSafeIp('172.32.0.1')).toBe(true);
    });

    it('blocks Class C private (192.168.x.x)', () => {
      expect(isSafeIp('192.168.1.1')).toBe(false);
    });

    it('blocks IPv6 loopback (::1)', () => {
      expect(isSafeIp('::1')).toBe(false);
    });

    it('allows standard public IPs', () => {
      expect(isSafeIp('8.8.8.8')).toBe(true);
      expect(isSafeIp('1.1.1.1')).toBe(true);
      expect(isSafeIp('142.250.190.46')).toBe(true);
    });
  });

  describe('resolveAndValidateHost()', () => {
    it('allows a safe public hostname (google.com)', async () => {
      const ip = await resolveAndValidateHost('google.com');
      expect(ip).toBeDefined();
      expect(isSafeIp(ip)).toBe(true);
    });

    it('blocks localhost directly', async () => {
      await expect(resolveAndValidateHost('localhost')).rejects.toThrow('SSRF Blocked');
    });

    it('blocks direct private IPs', async () => {
      await expect(resolveAndValidateHost('192.168.1.100')).rejects.toThrow('SSRF Blocked');
    });

    it('blocks external hostnames that resolve to local IPs (SSRF simulation)', async () => {
      // test local DNS
      await expect(resolveAndValidateHost('localtest.me')).rejects.toThrow(/SSRF Blocked.*(127\.0\.0\.1|::1)/);
    });
    
    it('fails gracefully on non-existent domains', async () => {
      await expect(resolveAndValidateHost('this-domain-definitely-does-not-exist.local')).rejects.toThrow('DNS Lookup failed');
    });
  });

});
