import type { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import { isPresetMarker, presetMarker } from '../avatars.logic';
import {
  planReactionToggle,
  type Update,
  type UpdateCategory,
  type UpdateComment,
  type ReactionRow,
} from './updates.logic';

export {
  REACTION_EMOJIS,
  summarizeReactions,
  planReactionToggle,
  validateUsername,
  validateComment,
  suggestUsernameFrom,
  relativeTime,
  messageOf,
  type Update,
  type UpdateCategory,
  type UpdateComment,
  type ReactionRow,
  type ReactionTally,
} from './updates.logic';
export { isSupabaseConfigured } from './supabase';

type ProfileRow = { username: string; avatar_url: string | null };
type ProfileRef = ProfileRow | ProfileRow[] | null;

function googleFieldsOf(user: User): {
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
} {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.length > 0 ? v : null;
  return {
    name: str(meta.full_name) ?? str(meta.name),
    email: str(user.email),
    avatarUrl: str(meta.avatar_url) ?? str(meta.picture),
  };
}

class NotConfiguredError extends Error {
  constructor() {
    super('Supabase is not configured');
    this.name = 'NotConfiguredError';
  }
}

function client() {
  if (!supabase) throw new NotConfiguredError();
  return supabase;
}

function pickProfile(ref: ProfileRef): {
  username: string;
  avatarUrl: string | null;
} {
  if (!ref) return { username: 'anon', avatarUrl: null };
  const row = Array.isArray(ref) ? ref[0] : ref;
  return {
    username: row?.username ?? 'anon',
    avatarUrl: row?.avatar_url ?? null,
  };
}

export async function getExistingUserId(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await client().auth.getSession();
  return data.session?.user.id ?? null;
}

// no anonymous fallback — writes gate behind google sign-in upstream, so a session exists here
export async function ensureSession(): Promise<string> {
  const { data } = await client().auth.getSession();
  const user = data.session?.user;
  if (!user || user.is_anonymous) throw new Error('Not signed in');
  return user.id;
}

export async function fetchUsername(userId: string): Promise<string | null> {
  const { data, error } = await client()
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { username: string } | null;
  return row?.username ?? null;
}

export async function fetchProfile(
  userId: string
): Promise<{ username: string | null; avatarUrl: string | null } | null> {
  const { data, error } = await client()
    .from('profiles')
    .select('username, avatar_url')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  const row = data as ProfileRow | null;
  if (!row) return null;
  return { username: row.username ?? null, avatarUrl: row.avatar_url ?? null };
}

export async function setUsername(username: string): Promise<string> {
  const userId = await ensureSession();
  const avatar_url = await getMyAvatarUrl();
  const { error } = await client()
    .from('profiles')
    .upsert({ id: userId, username, avatar_url });
  if (error) throw error;
  return userId;
}

export type Account = {
  userId: string;
  username: string | null;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export async function getAccount(): Promise<Account | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await client().auth.getSession();
  const user = data.session?.user;
  if (!user || user.is_anonymous) return null;
  const profile = await fetchProfile(user.id);
  const google = googleFieldsOf(user);
  return {
    userId: user.id,
    username: profile?.username ?? null,
    name: google.name,
    email: google.email,
    avatarUrl: profile?.avatarUrl ?? google.avatarUrl,
  };
}

export async function getMyAvatarUrl(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await client().auth.getSession();
  const user = data.session?.user;
  if (!user || user.is_anonymous) return null;
  return googleFieldsOf(user).avatarUrl;
}

export async function syncProfileAvatar(): Promise<void> {
  const avatarUrl = await getMyAvatarUrl();
  if (!avatarUrl) return;
  const userId = await getExistingUserId();
  if (!userId) return;
  const profile = await fetchProfile(userId);
  if (isPresetMarker(profile?.avatarUrl)) return; // keep a user-chosen preset
  await client()
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', userId);
}

export async function changeUsername(
  username: string
): Promise<'ok' | 'taken'> {
  const userId = await getExistingUserId();
  if (!userId) throw new Error('Not signed in');
  // omit avatar_url so a chosen avatar survives a rename (upsert leaves it)
  const { error } = await client()
    .from('profiles')
    .upsert({ id: userId, username });
  if (!error) return 'ok';
  if (error.code === '23505') return 'taken';
  throw error;
}

export async function setPresetAvatar(id: string): Promise<void> {
  const userId = await getExistingUserId();
  if (!userId) throw new Error('Not signed in');
  const { error } = await client()
    .from('profiles')
    .update({ avatar_url: presetMarker(id) })
    .eq('id', userId);
  if (error) throw error;
}

export function onAuthChange(handler: () => void): () => void {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange(() => handler());
  return () => data.subscription.unsubscribe();
}

export async function listUpdates(): Promise<Update[]> {
  const { data, error } = await client()
    .from('updates')
    .select('id, version, title, body, category, published_at, image_url')
    .order('published_at', { ascending: false });
  if (error) throw error;
  type Row = {
    id: string;
    version: string | null;
    title: string;
    body: string;
    category: UpdateCategory;
    published_at: string;
    image_url: string | null;
  };
  const rows = (data ?? []) as Row[];
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    title: row.title,
    body: row.body,
    category: row.category,
    publishedAt: row.published_at,
    imageUrl: row.image_url,
  }));
}

export async function listReactions(
  updateIds: string[]
): Promise<ReactionRow[]> {
  if (updateIds.length === 0) return [];
  const { data, error } = await client()
    .from('reactions')
    .select('update_id, emoji, user_id')
    .in('update_id', updateIds);
  if (error) throw error;
  type Row = { update_id: string; emoji: string; user_id: string };
  const rows = (data ?? []) as Row[];
  return rows.map((row) => ({
    updateId: row.update_id,
    emoji: row.emoji,
    userId: row.user_id,
  }));
}

// per-update comment totals; degrades to empty on error so a count hiccup
// never blanks the feed.
export async function listCommentCounts(
  updateIds: string[]
): Promise<Record<string, number>> {
  if (updateIds.length === 0) return {};
  const { data, error } = await client()
    .from('comments')
    .select('update_id')
    .in('update_id', updateIds);
  if (error) return {};
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { update_id: string }[]) {
    counts[row.update_id] = (counts[row.update_id] ?? 0) + 1;
  }
  return counts;
}

export async function toggleReaction(
  updateId: string,
  emoji: string,
  rows: ReactionRow[]
): Promise<'insert' | 'delete'> {
  const userId = await ensureSession();
  const action = planReactionToggle(rows, updateId, emoji, userId);
  if (action === 'insert') {
    const { error } = await client()
      .from('reactions')
      .insert({ update_id: updateId, emoji, user_id: userId });
    if (error) throw error;
    return action;
  }
  const { error } = await client()
    .from('reactions')
    .delete()
    .eq('update_id', updateId)
    .eq('emoji', emoji)
    .eq('user_id', userId);
  if (error) throw error;
  return action;
}

const commentsCache = new Map<string, UpdateComment[]>();

// cached per post — reopen paints instantly, then refreshes in bg
export function cachedComments(updateId: string): UpdateComment[] {
  return commentsCache.get(updateId) ?? [];
}

export function cacheComments(updateId: string, list: UpdateComment[]): void {
  commentsCache.set(updateId, list);
}

export async function listComments(updateId: string): Promise<UpdateComment[]> {
  const userId = await getExistingUserId();
  const { data, error } = await client()
    .from('comments')
    .select(
      'id, update_id, body, created_at, user_id, parent_id, profiles(username, avatar_url)'
    )
    .eq('update_id', updateId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  type Row = {
    id: string;
    update_id: string;
    body: string;
    created_at: string;
    user_id: string;
    parent_id: string | null;
    profiles: ProfileRef;
  };
  const rows = (data ?? []) as Row[];
  const likes = await fetchCommentLikes(
    rows.map((row) => row.id),
    userId
  );
  return rows.map((row) => {
    const profile = pickProfile(row.profiles);
    const like = likes.get(row.id);
    return {
      id: row.id,
      updateId: row.update_id,
      body: row.body,
      createdAt: row.created_at,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      mine: row.user_id === userId,
      parentId: row.parent_id,
      likeCount: like?.count ?? 0,
      liked: like?.mine ?? false,
    };
  });
}

// degrades to empty if comment_likes table not migrated yet
async function fetchCommentLikes(
  commentIds: string[],
  userId: string | null
): Promise<Map<string, { count: number; mine: boolean }>> {
  const out = new Map<string, { count: number; mine: boolean }>();
  if (commentIds.length === 0) return out;
  const { data, error } = await client()
    .from('comment_likes')
    .select('comment_id, user_id')
    .in('comment_id', commentIds);
  if (error || !data) return out;
  for (const like of data as { comment_id: string; user_id: string }[]) {
    const entry = out.get(like.comment_id) ?? { count: 0, mine: false };
    entry.count += 1;
    if (like.user_id === userId) entry.mine = true;
    out.set(like.comment_id, entry);
  }
  return out;
}

export async function likeComment(commentId: string): Promise<void> {
  const userId = await ensureSession();
  const { error } = await client()
    .from('comment_likes')
    .insert({ comment_id: commentId, user_id: userId });
  if (error) throw error;
}

export async function unlikeComment(commentId: string): Promise<void> {
  const userId = await ensureSession();
  const { error } = await client()
    .from('comment_likes')
    .delete()
    .eq('comment_id', commentId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function addComment(
  updateId: string,
  body: string,
  parentId: string | null = null
): Promise<void> {
  const userId = await ensureSession();
  const { error } = await client().from('comments').insert({
    update_id: updateId,
    body,
    user_id: userId,
    parent_id: parentId,
  });
  if (error) throw error;
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await client()
    .from('comments')
    .delete()
    .eq('id', commentId);
  if (error) throw error;
}

export async function editComment(
  commentId: string,
  body: string
): Promise<void> {
  const { error } = await client()
    .from('comments')
    .update({ body })
    .eq('id', commentId);
  if (error) throw error;
}

// no update_id filter — DELETE payloads carry only PK, so a filtered sub would
// silently drop deletes; caller refetches on any change.
type RtChannel = ReturnType<NonNullable<typeof supabase>['channel']>;
const liveChannels = new Map<string, RtChannel>();

function realtimeTables(
  channelName: string,
  tables: readonly string[],
  onChange: () => void
): () => void {
  if (!supabase) return () => undefined;
  const sb = supabase;
  // rapid reopen can leave prior same-name channel mid-teardown — dupe doubles
  // realtime traffic & churns JS thread, so drop any stale one first
  const stale = liveChannels.get(channelName);
  if (stale) void sb.removeChannel(stale);
  let chan = sb.channel(channelName);
  for (const table of tables) {
    chan = chan.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      onChange
    );
  }
  const channel = chan.subscribe();
  liveChannels.set(channelName, channel);
  return () => {
    if (liveChannels.get(channelName) === channel) {
      liveChannels.delete(channelName);
    }
    void sb.removeChannel(channel);
  };
}

export function subscribeToComments(
  updateId: string,
  onChange: () => void
): () => void {
  return realtimeTables(
    `comments-${updateId}`,
    ['comments', 'comment_likes'],
    onChange
  );
}

export function subscribeToFeed(onChange: () => void): () => void {
  return realtimeTables(
    'updates-feed',
    ['updates', 'reactions', 'comments'],
    onChange
  );
}
