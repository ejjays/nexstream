export type UpdateCategory = 'feature' | 'optimization' | 'fix';

export type Update = {
  id: string;
  version: string | null;
  title: string;
  body: string;
  category: UpdateCategory;
  publishedAt: string;
  imageUrl: string | null;
};

export type ReactionRow = {
  updateId: string;
  emoji: string;
  userId: string;
};

export type ReactionTally = {
  emoji: string;
  count: number;
  mine: boolean;
};

export type UpdateComment = {
  id: string;
  updateId: string;
  body: string;
  username: string;
  createdAt: string;
  mine: boolean;
};

export type Validation =
  | { ok: true; value: string }
  | { ok: false; error: string };

export const REACTION_EMOJIS = ['🔥', '❤️', '🎉', '👍'] as const;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const COMMENT_MAX = 500;

const USERNAME_PATTERN = /^\w+$/u;

export function validateUsername(raw: string): Validation {
  const value = raw.trim();
  if (value.length < USERNAME_MIN) {
    return { ok: false, error: `at least ${USERNAME_MIN} characters` };
  }
  if (value.length > USERNAME_MAX) {
    return { ok: false, error: `at most ${USERNAME_MAX} characters` };
  }
  if (!USERNAME_PATTERN.test(value)) {
    return { ok: false, error: 'letters, numbers, underscore only' };
  }
  return { ok: true, value };
}

export function validateComment(raw: string): Validation {
  const value = raw.trim();
  if (value.length === 0) return { ok: false, error: 'comment is empty' };
  if (value.length > COMMENT_MAX) {
    return { ok: false, error: `at most ${COMMENT_MAX} characters` };
  }
  return { ok: true, value };
}

export function summarizeReactions(
  rows: ReactionRow[],
  updateId: string,
  userId: string | null
): ReactionTally[] {
  return REACTION_EMOJIS.map((emoji) => {
    const matches = rows.filter(
      (row) => row.updateId === updateId && row.emoji === emoji
    );
    return {
      emoji,
      count: matches.length,
      mine: userId !== null && matches.some((row) => row.userId === userId),
    };
  });
}

export function planReactionToggle(
  rows: ReactionRow[],
  updateId: string,
  emoji: string,
  userId: string
): 'insert' | 'delete' {
  const exists = rows.some(
    (row) =>
      row.updateId === updateId && row.emoji === emoji && row.userId === userId
  );
  return exists ? 'delete' : 'insert';
}

export function relativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.round((now - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString();
}
