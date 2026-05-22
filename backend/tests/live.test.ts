import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { getVideoInfo } from '../src/services/ytdlp.service.js';
import rawCases from './fixtures/live.json';
import { CaseSchema } from './utils/schema.js';
import { assertOutcome } from './utils/assert.js';

// load cases
const testCases = z.array(CaseSchema).parse(rawCases);

describe('live monitoring', () => {

  it.each(testCases)('check $name', async ({ url, expected }) => {
    const startTime = performance.now();
    
    // retry if network blips
    const run = async (attempt = 1): Promise<any> => {
      try {
        return await getVideoInfo(url, [], false, null, `bot-${attempt}`);
      } catch (err) {
        if (attempt < 3) {
          console.warn(`[live] retry ${attempt} for ${url}`);
          await new Promise(r => setTimeout(r, 2000));
          return run(attempt + 1);
        }
        throw err;
      }
    };

    const info = await run();
    const duration = (performance.now() - startTime) / 1000;

    // check meta
    assertOutcome(info, expected);

    if (duration > 15) {
      console.warn(`[live] slow response: ${duration.toFixed(2)}s`);
    }

    console.log(`[live] ${info?.title} ok (${duration.toFixed(2)}s)`);
  }, { 
    timeout: 60000,
    retry: 2
  });

});
