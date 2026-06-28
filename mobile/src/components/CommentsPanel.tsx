import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import {
  ScrollView as GestureScrollView,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { MessageCircle, Trash2, ChevronLeft, X } from 'lucide-react-native';
import { HeartIcon, ReplyIcon, SendIcon } from './icons';
import tw from '../lib/tw';
import { useKeyboardLift } from '../hooks/useKeyboard';
import { tapSelection, tapSuccess } from '../lib/haptics';
import {
  listComments,
  addComment,
  deleteComment,
  validateComment,
  relativeTime,
  type UpdateComment,
} from '../lib/updates';

const AVATAR_COLORS = [
  '#22d3ee',
  '#a78bfa',
  '#34d399',
  '#f472b6',
  '#fbbf24',
  '#60a5fa',
  '#fb7185',
  '#2dd4bf',
];

const DIVIDER = {
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: 'rgba(255,255,255,0.09)',
};

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

function avatarColor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 100000;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? '#22d3ee';
}

function Avatar({ name, size }: { name: string; size: number }) {
  const seed = name.trim().length > 0 ? name.trim() : '?';
  const initial = (seed.charAt(0) || '?').toUpperCase();
  const color = avatarColor(seed);
  return (
    <View
      style={[
        tw`items-center justify-center rounded-full`,
        { width: size, height: size, backgroundColor: `${color}26` },
      ]}
    >
      <Text style={[tw`font-sans-bold`, { color, fontSize: size * 0.42 }]}>
        {initial}
      </Text>
    </View>
  );
}

function CommentRow({
  comment,
  liked,
  onToggleLike,
  onReply,
  onDelete,
}: {
  comment: UpdateComment;
  liked: boolean;
  onToggleLike: (commentId: string) => void;
  onReply: (comment: UpdateComment) => void;
  onDelete: (commentId: string) => void;
}) {
  const handle = comment.username.startsWith('@')
    ? comment.username
    : `@${comment.username}`;
  return (
    <View style={tw`flex-row`}>
      <Avatar name={comment.username} size={42} />
      <View style={tw`ml-3 flex-1`}>
        <View style={tw`flex-row items-center`}>
          <Text style={tw`font-sans-semibold text-[15px] text-white`}>
            {handle}
          </Text>
          <Text style={tw`ml-2 font-sans text-[13px] text-slate-500`}>
            {relativeTime(comment.createdAt)}
          </Text>
        </View>
        <Text
          style={tw`mt-1.5 font-sans text-[15px] leading-[22px] text-slate-200`}
        >
          {comment.body}
        </Text>
        <View style={tw`mt-3 flex-row items-center`}>
          <Pressable
            onPress={() => onToggleLike(comment.id)}
            hitSlop={6}
            style={tw`flex-row items-center`}
          >
            <HeartIcon size={20} color={liked ? '#ec4899' : '#64748b'} />
            <Text
              style={[
                tw`ml-2 font-sans-semibold text-[13px]`,
                liked ? tw`text-pink-400` : tw`text-slate-400`,
              ]}
            >
              {liked ? 1 : 0}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onReply(comment)}
            hitSlop={6}
            style={tw`ml-7 flex-row items-center`}
          >
            <ReplyIcon size={18} color="#64748b" />
            <Text
              style={tw`ml-2 font-sans-semibold text-[13px] text-slate-400`}
            >
              Reply
            </Text>
          </Pressable>
          {comment.mine ? (
            <Pressable
              onPress={() => onDelete(comment.id)}
              hitSlop={6}
              style={tw`ml-auto`}
            >
              <Trash2 size={15} color="#475569" strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function ReplyRow({
  comment,
  onDelete,
}: {
  comment: UpdateComment;
  onDelete: (commentId: string) => void;
}) {
  const handle = comment.username.startsWith('@')
    ? comment.username
    : `@${comment.username}`;
  return (
    <View style={tw`mt-4 flex-row pl-11`}>
      <Avatar name={comment.username} size={34} />
      <View style={tw`ml-2.5 flex-1`}>
        <Text style={tw`font-sans-semibold text-[14px] text-white`}>
          {handle}
        </Text>
        <Text style={tw`mt-1 font-sans text-[14px] leading-5 text-slate-200`}>
          {comment.body}
        </Text>
        <View style={tw`mt-1 flex-row items-center justify-end`}>
          {comment.mine ? (
            <Pressable
              onPress={() => onDelete(comment.id)}
              hitSlop={6}
              style={tw`mr-3`}
            >
              <Trash2 size={14} color="#475569" strokeWidth={2} />
            </Pressable>
          ) : null}
          <Text style={tw`font-sans text-[12px] text-slate-500`}>
            {relativeTime(comment.createdAt)}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function CommentsPanel({
  updateId,
  visible,
  myName,
  ensureUsername,
  onBack,
  dragGesture,
}: {
  updateId: string | null;
  visible: boolean;
  myName: string | null;
  ensureUsername: () => Promise<boolean>;
  onBack: () => void;
  dragGesture: ComponentProps<typeof GestureDetector>['gesture'];
}) {
  const [comments, setComments] = useState<UpdateComment[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [replyTarget, setReplyTarget] = useState<{
    id: string;
    username: string;
  } | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible || !updateId) return;
    setError(null);
    setInput('');
    setLiked({});
    setReplyTarget(null);
    listComments(updateId)
      .then(setComments)
      .catch((err) => setError(messageOf(err)));
  }, [visible, updateId]);

  const liftStyle = useKeyboardLift();

  const reload = async () => {
    if (updateId) setComments(await listComments(updateId));
  };

  const send = async () => {
    if (!updateId) return;
    const check = validateComment(input);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    if (!(await ensureUsername())) return;
    setBusy(true);
    setError(null);
    try {
      await addComment(updateId, check.value, replyTarget?.id ?? null);
      tapSuccess();
      setInput('');
      setReplyTarget(null);
      await reload();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (commentId: string) => {
    try {
      await deleteComment(commentId);
      await reload();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const toggleLike = (commentId: string) => {
    tapSelection();
    setLiked((prev) => ({ ...prev, [commentId]: !prev[commentId] }));
  };

  const startReply = (comment: UpdateComment) => {
    setReplyTarget({
      id: comment.parentId ?? comment.id,
      username: comment.username,
    });
    inputRef.current?.focus();
  };

  const canSend = !busy && input.trim().length > 0;
  const roots = comments.filter((comment) => !comment.parentId);
  const repliesFor = (rootId: string) =>
    comments
      .filter((comment) => comment.parentId === rootId)
      .sort(
        (first, second) =>
          new Date(first.createdAt).getTime() -
          new Date(second.createdAt).getTime()
      );

  return (
    <View style={tw`flex-1`}>
      <GestureDetector gesture={dragGesture}>
        <View>
          <View
            style={tw`mb-1 mt-3 h-1.5 w-10 self-center rounded-full bg-white/25`}
          />
          <View style={tw`flex-row items-center px-5 pb-4 my-1`}>
            <Pressable
              onPress={onBack}
              hitSlop={8}
              style={tw`-ml-1 mr-1.5 p-1`}
            >
              <ChevronLeft size={26} color="#cbd5e1" strokeWidth={2} />
            </Pressable>
            <Text
              style={tw`font-sans-bold text-[26px] tracking-tight text-white`}
            >
              Comments{' '}
              <Text style={tw`font-sans text-[15px] text-white/70`}>
                ({comments.length})
              </Text>
            </Text>
          </View>
        </View>
      </GestureDetector>

      <GestureScrollView
        style={tw`flex-1`}
        contentContainerStyle={tw`px-5 pb-4`}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {comments.length === 0 ? (
          <View style={tw`items-center py-12`}>
            <MessageCircle size={30} color="#334155" strokeWidth={1.8} />
            <Text style={tw`mt-3 font-sans text-[13px] text-slate-500`}>
              No comments yet — start the chat.
            </Text>
          </View>
        ) : (
          roots.map((root, index) => (
            <View
              key={root.id}
              style={[tw`mb-5 pb-5`, index < roots.length - 1 ? DIVIDER : null]}
            >
              <CommentRow
                comment={root}
                liked={!!liked[root.id]}
                onToggleLike={toggleLike}
                onReply={startReply}
                onDelete={remove}
              />
              {repliesFor(root.id).map((reply) => (
                <ReplyRow key={reply.id} comment={reply} onDelete={remove} />
              ))}
            </View>
          ))
        )}
      </GestureScrollView>

      <Animated.View style={[tw`px-4 pt-2`, liftStyle]}>
        {error ? (
          <Text style={tw`mb-2 px-1 font-sans text-[12px] text-red-400`}>
            {error}
          </Text>
        ) : null}
        {replyTarget ? (
          <View
            style={tw`mb-2 flex-row items-center justify-between rounded-2xl bg-white/5 px-3.5 py-2`}
          >
            <Text style={tw`font-sans text-[13px] text-slate-300`}>
              Replying to{' '}
              <Text style={tw`font-sans-semibold text-primary`}>
                @{replyTarget.username}
              </Text>
            </Text>
            <Pressable onPress={() => setReplyTarget(null)} hitSlop={8}>
              <X size={16} color="#94a3b8" strokeWidth={2} />
            </Pressable>
          </View>
        ) : null}
        <LinearGradient
          colors={['#182843', '#201d3e']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[
            tw`flex-row items-center rounded-full px-3 py-2`,
            {
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.18)',
            },
          ]}
        >
          <Avatar name={myName ?? '?'} size={34} />
          <TextInput
            ref={inputRef}
            value={input}
            onChangeText={setInput}
            placeholder={
              myName ? 'Add a comment…' : 'Set a username to comment'
            }
            placeholderTextColor="#828ea4"
            multiline
            style={tw`mx-3 max-h-24 flex-1 font-sans text-[16px] text-white`}
          />
          <Pressable
            onPress={() => void send()}
            disabled={!canSend}
            hitSlop={8}
            style={tw`pr-1.5`}
          >
            <SendIcon size={28} color={canSend ? '#3b9eff' : '#475569'} />
          </Pressable>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}
