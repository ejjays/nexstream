import { describe, it, expect } from 'vitest';
import { FinalResponseSchema } from '../../../shared/schemas/media.schema.js';

describe('Shared Media Contract', () => {
  const validResponse = {
    id: 'test_123',
    title: 'Test Video',
    artist: 'Test Artist',
    uploader: 'Test Uploader',
    album: 'Test Album',
    cover: 'https://example.com/cover.jpg',
    thumbnail: 'https://example.com/thumb.jpg',
    duration: 120,
    formats: [],
    audioFormats: [],
    isPartial: false,
    isIsrcMatch: false,
    webpage_url: 'https://youtube.com/watch?v=123'
  };

  it('should validate a correct FinalResponse object', () => {
    const result = FinalResponseSchema.safeParse(validResponse);
    expect(result.success).toBe(true);
  });

  it('should reject a FinalResponse missing required fields', () => {
    const invalid = { ...validResponse };
    delete (invalid as any).title;
    
    const result = FinalResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('title');
    }
  });

  it('should reject invalid URL formats', () => {
    const invalid = { ...validResponse, webpage_url: 'not-a-url' };
    const result = FinalResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should allow optional spotifyMetadata', () => {
    const withSpotify = {
      ...validResponse,
      spotifyMetadata: {
        id: 'sp_123',
        title: 'Spotify Title',
        artist: 'Spotify Artist'
      }
    };
    const result = FinalResponseSchema.safeParse(withSpotify);
    expect(result.success).toBe(true);
  });
});
