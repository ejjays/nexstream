import { describe, it, expect } from 'vitest';
import {
  parseMentions,
  pushAvatarUrl,
  socialTitle,
  previewText,
  resolveCommentRecipients,
  resolveLikeRecipients,
  isMuted,
  collapseKeyFor,
  buildSocialNotification,
  buildUpdateNotification,
  type MuteFlags,
} from '../supabase/functions/send-push/logic';

describe('parseMentions', () => {
  it('extracts every @handle, deduped, case preserved', () => {
    expect(parseMentions('hey @alice and @Bob and @alice again')).toEqual([
      'alice',
      'Bob',
    ]);
  });

  it('ignores too-short handles and bare @', () => {
    expect(parseMentions('@ab @ hi')).toEqual([]);
  });

  it('returns empty for no mentions', () => {
    expect(parseMentions('just a normal comment')).toEqual([]);
  });
});

describe('pushAvatarUrl', () => {
  it.each([
    ['https://cdn/x.jpg', 'https://cdn/x.jpg'],
    ['https://cdn/y.png', 'https://cdn/y.png'],
    ['preset:stitch', undefined],
    [null, undefined],
    [undefined, undefined],
  ])('%s -> %s', (input, expected) => {
    expect(pushAvatarUrl(input)).toBe(expected);
  });
});

describe('socialTitle', () => {
  it.each([
    ['reply', '@alice replied to your comment'],
    ['mention', '@alice mentioned you'],
    ['like', '@alice liked your comment'],
    ['comment', '@alice commented'],
  ] as const)('%s title', (type, expected) => {
    expect(socialTitle(type, 'alice')).toBe(expected);
  });

  it('does not double the @ when name already has one', () => {
    expect(socialTitle('reply', '@alice')).toBe(
      '@alice replied to your comment'
    );
  });
});

describe('previewText', () => {
  it('trims and returns body text', () => {
    expect(previewText({ body: '  hello  ' })).toBe('hello');
  });
  it('truncates long bodies with an ellipsis', () => {
    const out = previewText({ body: 'x'.repeat(200) });
    expect(out.length).toBe(120);
    expect(out.endsWith('…')).toBe(true);
  });
  it('falls back to media labels', () => {
    expect(previewText({ body: '', gifUrl: 'g' })).toBe('GIF');
    expect(previewText({ body: null, imageUrl: 'i' })).toBe('📷 Photo');
  });
  it('strips whole @mentions from the body', () => {
    expect(previewText({ body: '@alice thanks!' })).toBe('thanks!');
    expect(previewText({ body: 'cc @bob and @carol' })).toBe('cc and');
  });
  it('falls back to media when the body is only a mention', () => {
    expect(previewText({ body: '@alice', gifUrl: 'g' })).toBe('GIF');
  });
  it('is empty with no content', () => {
    expect(previewText({})).toBe('');
  });
});

describe('resolveCommentRecipients', () => {
  it('notifies the parent author on a reply', () => {
    expect(
      resolveCommentRecipients({
        actorId: 'me',
        parentAuthorId: 'p1',
        mentionedUserIds: [],
        creatorIds: [],
      })
    ).toEqual([{ userId: 'p1', type: 'reply' }]);
  });

  it('notifies creators on a top-level comment', () => {
    expect(
      resolveCommentRecipients({
        actorId: 'me',
        parentAuthorId: null,
        mentionedUserIds: [],
        creatorIds: ['dev'],
      })
    ).toEqual([{ userId: 'dev', type: 'comment' }]);
  });

  it('notifies mentioned users', () => {
    expect(
      resolveCommentRecipients({
        actorId: 'me',
        parentAuthorId: null,
        mentionedUserIds: ['u2'],
        creatorIds: [],
      })
    ).toEqual([{ userId: 'u2', type: 'mention' }]);
  });

  it('never notifies the actor about their own comment', () => {
    expect(
      resolveCommentRecipients({
        actorId: 'me',
        parentAuthorId: 'me',
        mentionedUserIds: ['me'],
        creatorIds: ['me'],
      })
    ).toEqual([]);
  });

  it('dedupes to one type per recipient with reply > mention > comment', () => {
    const out = resolveCommentRecipients({
      actorId: 'me',
      parentAuthorId: 'p1',
      mentionedUserIds: ['p1', 'u2'],
      creatorIds: ['p1', 'u2', 'dev'],
    });
    expect(out).toEqual([
      { userId: 'p1', type: 'reply' },
      { userId: 'u2', type: 'mention' },
      { userId: 'dev', type: 'comment' },
    ]);
  });
});

describe('resolveLikeRecipients', () => {
  it('notifies the liked comment author', () => {
    expect(
      resolveLikeRecipients({ actorId: 'me', commentAuthorId: 'author' })
    ).toEqual([{ userId: 'author', type: 'like' }]);
  });
  it('is a no-op when you like your own comment', () => {
    expect(
      resolveLikeRecipients({ actorId: 'me', commentAuthorId: 'me' })
    ).toEqual([]);
  });
});

describe('isMuted', () => {
  it('mutes every social type when social is off', () => {
    const off: MuteFlags = { notif_social: false };
    expect(isMuted('reply', off)).toBe(true);
    expect(isMuted('mention', off)).toBe(true);
    expect(isMuted('like', off)).toBe(true);
    expect(isMuted('comment', off)).toBe(true);
  });
  it('is not muted when social is on', () => {
    const on: MuteFlags = { notif_social: true };
    expect(isMuted('reply', on)).toBe(false);
    expect(isMuted('comment', on)).toBe(false);
  });
});

describe('collapseKeyFor', () => {
  it('collapses likes per comment', () => {
    expect(collapseKeyFor('like', 'c1')).toBe('like:c1');
  });
  it.each(['reply', 'mention', 'comment'] as const)(
    'leaves %s uncollapsed',
    (type) => {
      expect(collapseKeyFor(type, 'c1')).toBeUndefined();
    }
  );
});

describe('buildSocialNotification', () => {
  it('includes actor avatar as largeIcon + BIG_TEXT preview + tap data', () => {
    const out = buildSocialNotification({
      type: 'reply',
      actorName: 'alice',
      actorAvatar: 'https://cdn/a.jpg',
      preview: 'nice one',
      updateId: 'u1',
      commentId: 'c1',
    });
    expect(out.title).toBe('@alice replied to your comment');
    expect(out.body).toBe('nice one');
    expect(out.android.largeIcon).toBe('https://cdn/a.jpg');
    expect(out.android.style).toEqual({ type: 'BIG_TEXT', text: 'nice one' });
    expect(out.data).toEqual({
      type: 'social',
      kind: 'reply',
      updateId: 'u1',
      commentId: 'c1',
      actorName: 'alice',
      avatar: 'https://cdn/a.jpg',
    });
  });

  it('omits largeIcon for a preset avatar but keeps it in data for the client', () => {
    const out = buildSocialNotification({
      type: 'like',
      actorName: 'bob',
      actorAvatar: 'preset:stitch',
      preview: '',
      updateId: 'u1',
      commentId: 'c1',
    });
    expect(out.android.largeIcon).toBeUndefined();
    expect(out.android.style).toBeUndefined();
    expect(out.data.avatar).toBe('preset:stitch');
  });
});

describe('buildUpdateNotification', () => {
  it('uses BIG_PICTURE when the update has an image', () => {
    const out = buildUpdateNotification({
      category: 'feature',
      title: 'Playlists',
      creatorAvatar: 'https://cdn/dev.jpg',
      imageUrl: 'https://cdn/shot.png',
      updateId: 'u9',
    });
    expect(out.title).toBe('New feature: Playlists');
    expect(out.android.largeIcon).toBe('https://cdn/dev.jpg');
    expect(out.android.style).toEqual({
      type: 'BIG_PICTURE',
      picture: 'https://cdn/shot.png',
    });
    expect(out.data).toEqual({
      type: 'social',
      kind: 'update',
      updateId: 'u9',
      avatar: 'https://cdn/dev.jpg',
    });
  });

  it('falls back to BIG_TEXT when there is no image', () => {
    const out = buildUpdateNotification({
      category: 'fix',
      title: 'Crash fix',
      creatorAvatar: null,
      imageUrl: null,
      updateId: 'u9',
    });
    expect(out.android.style).toEqual({
      type: 'BIG_TEXT',
      text: 'New fix: Crash fix',
    });
    expect(out.android.largeIcon).toBeUndefined();
  });
});
