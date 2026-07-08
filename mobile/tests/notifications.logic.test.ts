import { describe, it, expect } from 'vitest';
import {
  countUnread,
  badgeLabel,
  notificationAction,
  applyAllRead,
  type InboxItem,
} from '../src/lib/social/notifications.logic';

const item = (over: Partial<InboxItem>): InboxItem => ({
  id: 'n1',
  type: 'reply',
  actorName: 'alice',
  actorAvatar: null,
  updateId: 'u1',
  commentId: 'c1',
  preview: 'hi',
  createdAt: '2026-07-08T12:00:00Z',
  read: false,
  ...over,
});

describe('countUnread', () => {
  it('counts only unread items', () => {
    expect(
      countUnread([item({ read: false }), item({ read: true }), item({})])
    ).toBe(2);
  });
  it('is zero for an empty inbox', () => {
    expect(countUnread([])).toBe(0);
  });
});

describe('badgeLabel', () => {
  it.each([
    [0, ''],
    [1, '1'],
    [9, '9'],
    [10, '9+'],
    [250, '9+'],
  ])('%s -> %s', (count, expected) => {
    expect(badgeLabel(count)).toBe(expected);
  });
});

describe('notificationAction', () => {
  it.each([
    ['reply', 'replied to your comment'],
    ['mention', 'mentioned you'],
    ['like', 'liked your comment'],
    ['comment', 'commented on a post'],
  ] as const)('%s -> %s', (type, expected) => {
    expect(notificationAction(type)).toBe(expected);
  });
});

describe('applyAllRead', () => {
  it('marks every item read without mutating input', () => {
    const input = [item({ read: false }), item({ id: 'n2', read: true })];
    const out = applyAllRead(input);
    expect(out.every((entry) => entry.read)).toBe(true);
    expect(input[0].read).toBe(false);
  });
});
