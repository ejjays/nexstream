import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

const scriptDirective = (csp: string): string | undefined =>
  csp
    .split(';')
    .map((dir) => dir.trim())
    .find((dir) => dir.startsWith('script-src'));

describe('CSP headers', () => {
  it('locks script-src to self with no unsafe-inline', async () => {
    const res = await request(app).get('/ping');
    const csp = res.headers['content-security-policy'] ?? '';
    const directive = scriptDirective(csp);
    expect(directive).toBeDefined();
    expect(directive).toContain("'self'");
    expect(directive).not.toContain('unsafe-inline');
  });
});
