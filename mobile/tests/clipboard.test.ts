import { describe, it, expect } from 'vitest';

const URL_RE = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gu;

function extractUrl(text: string): string {
  const match = text.match(URL_RE);
  if (!match) return '';
  return match[0].replace(/[.,;:!?)\]>]+$/u, '');
}

describe('extractUrl', () => {
  it.each([
    ['https://youtube.com/watch?v=abc', 'https://youtube.com/watch?v=abc'],
    ['https://youtube.com/watch?v=abc ', 'https://youtube.com/watch?v=abc'],
    [
      'Click to view! https://youtube.com/watch?v=abc',
      'https://youtube.com/watch?v=abc',
    ],
    [
      'Check this: https://youtube.com/watch?v=abc nice video!',
      'https://youtube.com/watch?v=abc',
    ],
    ['https://youtube.com/watch?v=abc.', 'https://youtube.com/watch?v=abc'],
    ['https://youtube.com/watch?v=abc)', 'https://youtube.com/watch?v=abc'],
    ['(https://youtube.com/watch?v=abc)', 'https://youtube.com/watch?v=abc'],
    ['no url here', ''],
    ['', ''],
    ['http://example.com', 'http://example.com'],
    [
      'https://x.com/user/status/123?s=20&t=abc',
      'https://x.com/user/status/123?s=20&t=abc',
    ],
  ])('%s → %s', (input, expected) => {
    expect(extractUrl(input)).toBe(expected);
  });
});
