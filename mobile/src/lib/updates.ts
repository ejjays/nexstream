import { supabase, isSupabaseConfigured } from './supabase';
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
  relativeTime,
  type Update,
  type UpdateCategory,
  type UpdateComment,
  type ReactionRow,
  type ReactionTally,
} from './updates.logic';
export { isSupabaseConfigured } from './supabase';

type ProfileRef = { username: string } | { username: string }[] | null;

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

function pickUsername(ref: ProfileRef): string {
  if (!ref) return 'anon';
  if (Array.isArray(ref)) return ref[0]?.username ?? 'anon';
  return ref.username;
}

export async function getExistingUserId(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await client().auth.getSession();
  return data.session?.user.id ?? null;
}

export async function ensureSession(): Promise<string> {
  const auth = client().auth;
  const { data } = await auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: created, error } = await auth.signInAnonymously();
  if (error) throw error;
  const userId = created.user?.id;
  if (!userId) throw new Error('Anonymous sign-in returned no user');
  return userId;
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

export async function setUsername(username: string): Promise<string> {
  const userId = await ensureSession();
  const { error } = await client()
    .from('profiles')
    .upsert({ id: userId, username });
  if (error) throw error;
  return userId;
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

export async function listComments(updateId: string): Promise<UpdateComment[]> {
  const userId = await getExistingUserId();
  const { data, error } = await client()
    .from('comments')
    .select('id, update_id, body, created_at, user_id, profiles(username)')
    .eq('update_id', updateId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  type Row = {
    id: string;
    update_id: string;
    body: string;
    created_at: string;
    user_id: string;
    profiles: ProfileRef;
  };
  const rows = (data ?? []) as Row[];
  return rows.map((row) => ({
    id: row.id,
    updateId: row.update_id,
    body: row.body,
    createdAt: row.created_at,
    username: pickUsername(row.profiles),
    mine: row.user_id === userId,
  }));
}

export async function addComment(
  updateId: string,
  body: string
): Promise<void> {
  const userId = await ensureSession();
  const { error } = await client()
    .from('comments')
    .insert({ update_id: updateId, body, user_id: userId });
  if (error) throw error;
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await client()
    .from('comments')
    .delete()
    .eq('id', commentId);
  if (error) throw error;
}
