import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getInfo } from '../../src/services/extractors/tiktok.js';
import { z } from 'zod';
import { CaseSchema } from '../utils/schema.js';
import { assertOutcome } from '../utils/assert.js';
import rawCases from '../fixtures/extractors/tiktok.json';

const testCases = z.array(CaseSchema).parse(rawCases);

describe('TikTok JS Extractor (Data-Driven)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each(testCases)('should extract metadata for $name', async (testCase) => {
    const info = await getInfo(testCase.url);
    assertOutcome(info, testCase.expected);

    if (testCase.expected.status === 'ok' && testCase.expected.type === 'video') {
       expect(info?.formats?.length).toBeGreaterThan(0);
       expect(info?.formats?.[0].url).toContain('http');
    }
  });

  it('should correctly expand short URLs to full tiktok.com URLs', async () => {
    const testCase = testCases[0];
    const info = await getInfo(testCase.url);
    expect(info?.webpageUrl).toContain('tiktok.com/@');
    expect(info?.webpageUrl).toContain('/video/');
  });
});
