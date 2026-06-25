import { describe, it, expect } from 'vitest';
import { pickBest, isTopicChannel } from '../src/extractors/spotify/index';
import type { YtSearchResult } from '../src/extractors/youtube/bridge';

const mk = (
  id: string,
  author: string,
  durationSec: number
): YtSearchResult => ({ id, author, durationSec, title: id });

describe('isTopicChannel', () => {
  it.each<[string | undefined, boolean]>([
    ['Hillsong Worship - Topic', true],
    ['Some Artist - Topic', true],
    ['Hillsong Worship', false],
    ['Topic Studios', false],
    [undefined, false],
  ])('%s -> %s', (author, expected) => {
    expect(isTopicChannel(author)).toBe(expected);
  });
});

describe('pickBest', () => {
  it('prefers a regular upload over a topic art track (avoids 403)', () => {
    const candidates = [
      mk('topic', 'Hillsong Worship - Topic', 240), // exact duration
      mk('regular', 'Hillsong Worship', 242),
    ];
    expect(pickBest(candidates, 240000, 'Hillsong Worship')?.id).toBe('regular');
  });

  it('falls back to the topic track when no regular upload exists', () => {
    const candidates = [mk('topic', 'Hillsong Worship - Topic', 240)];
    expect(pickBest(candidates, 240000, 'Hillsong Worship')?.id).toBe('topic');
  });

  it('among regular uploads prefers artist match then closest duration', () => {
    const candidates = [
      mk('wrong', 'Random Channel', 240),
      mk('right', 'Hillsong Worship', 250),
    ];
    expect(pickBest(candidates, 240000, 'Hillsong Worship')?.id).toBe('right');
  });
});
