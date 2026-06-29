import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Keyboard } from 'react-native';
import {
  ScrollView as GestureScrollView,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeOutUp,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  MessageCircle,
  Trash2,
  Pencil,
  MoreHorizontal,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react-native';
import { HeartIcon, ReplyIcon, SendIcon } from './icons';
import Avatar from './Avatar';
import BottomSheet from './sheets/BottomSheet';
import tw from '../lib/tw';
import { useKeyboardLift } from '../hooks/useKeyboard';
import { tapSelection, tapSuccess } from '../lib/haptics';
import {
  listComments,
  addComment,
  deleteComment,
  editComment,
  likeComment,
  unlikeComment,
  validateComment,
  relativeTime,
  messageOf,
  type UpdateComment,
} from '../lib/social/updates';

const DIVIDER = {
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: 'rgba(255,255,255,0.09)',
};

const THREAD = 'rgba(255,255,255,0.16)';
// matches the screen bg so overlapping reply avatars read as separate rings
const RING = '#030014';
// solid floating pill above the input (reply/edit context)
const BANNER = {
  backgroundColor: '#1a1f3a',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.1)',
};

// renders comment text, tinting a leading @mention so reply context stands out
function Body({
  text,
  style,
}: {
  text: string;
  style: ComponentProps<typeof Text>['style'];
}) {
  const match = /^(@\S+)(\s)([\s\S]+)$/u.exec(text);
  if (!match) return <Text style={style}>{text}</Text>;
  return (
    <Text style={style}>
      <Text style={tw`font-sans-semibold text-primary`}>{match[1]}</Text>
      {match[2]}
      {match[3]}
    </Text>
  );
}

// ╰ connector dropping from the thread line and rounding toward the reply avatar
function ThreadCurve({ top }: { top: number }) {
  return (
    <View
      style={{
        position: 'absolute',
        left: 20,
        top,
        width: 16,
        height: 15,
        borderColor: THREAD,
        borderLeftWidth: 2,
        borderBottomWidth: 2,
        borderBottomLeftRadius: 12,
      }}
    />
  );
}

function CommentRow({
  comment,
  onToggleLike,
  onReply,
  onOptions,
  hasLine,
}: {
  comment: UpdateComment;
  onToggleLike: (comment: UpdateComment) => void;
  onReply: (comment: UpdateComment) => void;
  onOptions: (comment: UpdateComment) => void;
  hasLine: boolean;
}) {
  const handle = comment.username.startsWith('@')
    ? comment.username
    : `@${comment.username}`;
  return (
    <View style={tw`flex-row`}>
      <View style={tw`items-center`}>
        <Avatar name={comment.username} size={42} uri={comment.avatarUrl} />
        {hasLine ? (
          <View
            style={[
              tw`mt-1.5 flex-1 rounded-full`,
              { width: 2, backgroundColor: THREAD },
            ]}
          />
        ) : null}
      </View>
      <View style={tw`ml-3 flex-1`}>
        <View style={tw`flex-row items-center`}>
          <Text style={tw`font-sans-semibold text-[15px] text-white`}>
            {handle}
          </Text>
          <Text style={tw`ml-2 font-sans text-[13px] text-slate-500`}>
            {relativeTime(comment.createdAt)}
          </Text>
          {comment.mine ? (
            <Pressable
              onPress={() => onOptions(comment)}
              hitSlop={10}
              style={tw`ml-auto pl-2`}
            >
              <MoreHorizontal size={18} color="#64748b" strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>
        <Body
          text={comment.body}
          style={tw`mt-1.5 pl-2.5 font-sans text-[15px] leading-[22px] text-slate-200`}
        />
        <View style={tw`mt-3 flex-row items-center`}>
          <Pressable
            onPress={() => onToggleLike(comment)}
            hitSlop={6}
            style={tw`flex-row items-center`}
          >
            <HeartIcon
              size={20}
              color={comment.liked ? '#ec4899' : '#64748b'}
            />
            <Text
              style={[
                tw`ml-2 font-sans-semibold text-[13px]`,
                comment.liked ? tw`text-pink-400` : tw`text-slate-400`,
              ]}
            >
              {comment.likeCount}
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
        </View>
      </View>
    </View>
  );
}

function ReplyRow({
  comment,
  isLast,
  onToggleLike,
  onReply,
  onOptions,
}: {
  comment: UpdateComment;
  isLast: boolean;
  onToggleLike: (comment: UpdateComment) => void;
  onReply: (comment: UpdateComment) => void;
  onOptions: (comment: UpdateComment) => void;
}) {
  const handle = comment.username.startsWith('@')
    ? comment.username
    : `@${comment.username}`;
  return (
    <View style={tw`flex-row`}>
      <View style={tw`w-9`}>
        <View
          style={{
            position: 'absolute',
            left: 20,
            top: 0,
            bottom: isLast ? undefined : 0,
            height: isLast ? 30 : undefined,
            width: 2,
            backgroundColor: THREAD,
          }}
        />
        <ThreadCurve top={24} />
      </View>
      <View style={tw`flex-1 flex-row pt-6`}>
        <Avatar name={comment.username} size={30} uri={comment.avatarUrl} />
        <View style={tw`ml-2.5 flex-1`}>
          <View style={tw`flex-row items-center`}>
            <Text style={tw`font-sans-semibold text-[14px] text-white`}>
              {handle}
            </Text>
            <Text style={tw`ml-2 font-sans text-[12px] text-slate-500`}>
              {relativeTime(comment.createdAt)}
            </Text>
            {comment.mine ? (
              <Pressable
                onPress={() => onOptions(comment)}
                hitSlop={10}
                style={tw`ml-auto pl-2`}
              >
                <MoreHorizontal size={16} color="#64748b" strokeWidth={2} />
              </Pressable>
            ) : null}
          </View>
          <Body
            text={comment.body}
            style={tw`mt-2 pl-2.5 font-sans text-[14px] leading-5 text-slate-200`}
          />
          <View style={tw`mt-2 flex-row items-center`}>
            <Pressable
              onPress={() => onToggleLike(comment)}
              hitSlop={6}
              style={tw`flex-row items-center`}
            >
              <HeartIcon
                size={17}
                color={comment.liked ? '#ec4899' : '#64748b'}
              />
              <Text
                style={[
                  tw`ml-1.5 font-sans-semibold text-[12px]`,
                  comment.liked ? tw`text-pink-400` : tw`text-slate-400`,
                ]}
              >
                {comment.likeCount}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onReply(comment)}
              hitSlop={6}
              style={tw`ml-6 flex-row items-center`}
            >
              <ReplyIcon size={16} color="#64748b" />
              <Text
                style={tw`ml-1.5 font-sans-semibold text-[12px] text-slate-400`}
              >
                Reply
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function CommentsPanel({
  updateId,
  visible,
  myName,
  myAvatar,
  ensureUsername,
  onBack,
  dragGesture,
}: {
  updateId: string | null;
  visible: boolean;
  myName: string | null;
  myAvatar: string | null;
  ensureUsername: () => Promise<boolean>;
  onBack: () => void;
  dragGesture: ComponentProps<typeof GestureDetector>['gesture'];
}) {
  const [comments, setComments] = useState<UpdateComment[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [replyTarget, setReplyTarget] = useState<{
    id: string;
    handle: string;
    mention: string | null;
  } | null>(null);
  const [editTarget, setEditTarget] = useState<{ id: string } | null>(null);
  const [options, setOptions] = useState<UpdateComment | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible || !updateId) return;
    setError(null);
    setInput('');
    setExpanded({});
    setReplyTarget(null);
    setEditTarget(null);
    setOptions(null);
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
    setError(null);
    tapSuccess();
    Keyboard.dismiss();

    if (editTarget) {
      const { id } = editTarget;
      const nextBody = check.value;
      setComments((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, body: nextBody } : item
        )
      );
      setInput('');
      setEditTarget(null);
      try {
        await editComment(id, nextBody);
      } catch (err) {
        setError(messageOf(err));
        await reload();
      }
      return;
    }

    const body = replyTarget?.mention
      ? `${replyTarget.mention} ${check.value}`
      : check.value;
    const parentId = replyTarget?.id ?? null;
    const tempId = `temp-${Date.now()}`;
    const optimistic: UpdateComment = {
      id: tempId,
      updateId,
      body,
      username: myName ?? '',
      avatarUrl: myAvatar,
      createdAt: new Date().toISOString(),
      mine: true,
      parentId,
      likeCount: 0,
      liked: false,
    };
    setComments((prev) => [optimistic, ...prev]);
    if (parentId) setExpanded((prev) => ({ ...prev, [parentId]: true }));
    setInput('');
    setReplyTarget(null);
    try {
      await addComment(updateId, body, parentId);
      await reload();
    } catch (err) {
      setComments((prev) => prev.filter((item) => item.id !== tempId));
      setInput(check.value);
      setError(messageOf(err));
    }
  };

  const remove = async (commentId: string) => {
    setOptions(null);
    setComments((prev) =>
      prev.filter(
        (item) => item.id !== commentId && item.parentId !== commentId
      )
    );
    try {
      await deleteComment(commentId);
    } catch (err) {
      setError(messageOf(err));
      await reload();
    }
  };

  const toggleLike = (comment: UpdateComment) => {
    tapSelection();
    const next = !comment.liked;
    setComments((prev) =>
      prev.map((item) =>
        item.id === comment.id
          ? {
              ...item,
              liked: next,
              likeCount: Math.max(0, item.likeCount + (next ? 1 : -1)),
            }
          : item
      )
    );
    (next ? likeComment : unlikeComment)(comment.id).catch((err) => {
      setComments((prev) =>
        prev.map((item) =>
          item.id === comment.id
            ? { ...item, liked: comment.liked, likeCount: comment.likeCount }
            : item
        )
      );
      setError(messageOf(err));
    });
  };

  const toggleReplies = (rootId: string) => {
    tapSelection();
    setExpanded((prev) => ({ ...prev, [rootId]: !prev[rootId] }));
  };

  const startReply = (comment: UpdateComment) => {
    setEditTarget(null);
    const handle = comment.username.startsWith('@')
      ? comment.username
      : `@${comment.username}`;
    setReplyTarget({
      id: comment.parentId ?? comment.id,
      handle,
      // only a reply-to-a-reply needs the @mention to keep its context in the flat thread
      mention: comment.parentId ? handle : null,
    });
    inputRef.current?.focus();
  };

  const startEdit = (comment: UpdateComment) => {
    setOptions(null);
    setReplyTarget(null);
    setEditTarget({ id: comment.id });
    setInput(comment.body);
    setTimeout(() => inputRef.current?.focus(), 180);
  };

  const cancelEdit = () => {
    setEditTarget(null);
    setInput('');
  };

  const canSend = input.trim().length > 0;
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
          roots.map((root, index) => {
            const replies = repliesFor(root.id);
            const hasReplies = replies.length > 0;
            const isOpen = !!expanded[root.id];
            return (
              <Animated.View
                key={root.id}
                entering={FadeInDown.duration(220)}
                style={[
                  tw`mb-5 pb-5`,
                  index < roots.length - 1 ? DIVIDER : null,
                ]}
              >
                <CommentRow
                  comment={root}
                  onToggleLike={toggleLike}
                  onReply={startReply}
                  onOptions={setOptions}
                  hasLine={hasReplies}
                />
                {hasReplies && isOpen ? (
                  <Animated.View
                    entering={FadeInUp.duration(180)}
                    exiting={FadeOutUp.duration(140)}
                  >
                    {replies.map((reply, replyIndex) => (
                      <ReplyRow
                        key={reply.id}
                        comment={reply}
                        isLast={replyIndex === replies.length - 1}
                        onToggleLike={toggleLike}
                        onReply={startReply}
                        onOptions={setOptions}
                      />
                    ))}
                    <Pressable
                      onPress={() => toggleReplies(root.id)}
                      hitSlop={6}
                      style={tw`ml-9 mt-3 flex-row items-center`}
                    >
                      <ChevronUp size={16} color="#64748b" strokeWidth={2.5} />
                      <Text
                        style={tw`ml-2 font-sans-medium text-[13px] text-slate-400`}
                      >
                        Hide replies
                      </Text>
                    </Pressable>
                  </Animated.View>
                ) : null}
                {hasReplies && !isOpen ? (
                  <Pressable
                    onPress={() => toggleReplies(root.id)}
                    hitSlop={6}
                    style={tw`flex-row`}
                  >
                    <View style={tw`w-9`}>
                      <View
                        style={{
                          position: 'absolute',
                          left: 20,
                          top: 0,
                          height: 20,
                          width: 2,
                          backgroundColor: THREAD,
                        }}
                      />
                      <ThreadCurve top={16} />
                    </View>
                    <View style={tw`flex-row items-center pt-4`}>
                      <View style={tw`flex-row`}>
                        {replies.slice(0, 3).map((reply, avatarIndex) => (
                          <View
                            key={reply.id}
                            style={[
                              {
                                borderRadius: 999,
                                borderWidth: 2,
                                borderColor: RING,
                              },
                              avatarIndex > 0 ? { marginLeft: -12 } : null,
                            ]}
                          >
                            <Avatar
                              name={reply.username}
                              size={22}
                              uri={reply.avatarUrl}
                            />
                          </View>
                        ))}
                      </View>
                      <ChevronDown
                        size={16}
                        color="#94a3b8"
                        strokeWidth={2.5}
                        style={tw`ml-1.5`}
                      />
                      <Text
                        style={tw`ml-2 font-sans-medium text-[13px] text-slate-400`}
                      >
                        Show {replies.length}{' '}
                        {replies.length === 1 ? 'reply' : 'replies'}
                      </Text>
                    </View>
                  </Pressable>
                ) : null}
              </Animated.View>
            );
          })
        )}
      </GestureScrollView>

      <Animated.View style={[tw`px-4 pt-2`, liftStyle]}>
        {error ? (
          <Text style={tw`mb-2 px-1 font-sans text-[12px] text-red-400`}>
            {error}
          </Text>
        ) : null}
        {editTarget ? (
          <View
            style={[
              tw`mb-2 flex-row items-center justify-between rounded-2xl px-3.5 py-2.5`,
              BANNER,
            ]}
          >
            <View style={tw`flex-row items-center`}>
              <Pencil size={14} color="#06b6d4" strokeWidth={2} />
              <Text style={tw`ml-2 font-sans text-[13px] text-slate-300`}>
                Editing your comment
              </Text>
            </View>
            <Pressable onPress={cancelEdit} hitSlop={8} style={tw`ml-2`}>
              <X size={16} color="#94a3b8" strokeWidth={2} />
            </Pressable>
          </View>
        ) : replyTarget ? (
          <View
            style={[
              tw`mb-2 flex-row items-center justify-between rounded-2xl px-3.5 py-2.5`,
              BANNER,
            ]}
          >
            <View style={tw`flex-1 flex-row items-center`}>
              <ReplyIcon size={15} color="#06b6d4" />
              <Text
                style={tw`ml-2 font-sans text-[13px] text-slate-300`}
                numberOfLines={1}
              >
                Replying to{' '}
                <Text style={tw`font-sans-semibold text-primary`}>
                  {replyTarget.handle}
                </Text>
              </Text>
            </View>
            <Pressable
              onPress={() => setReplyTarget(null)}
              hitSlop={8}
              style={tw`ml-2`}
            >
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
          <Avatar name={myName ?? '?'} size={34} uri={myAvatar} />
          <TextInput
            ref={inputRef}
            value={input}
            onChangeText={setInput}
            placeholder={
              editTarget
                ? 'Edit your comment…'
                : myName
                  ? 'Add a comment…'
                  : 'Set a username to comment'
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

      <BottomSheet
        open={!!options}
        onClose={() => setOptions(null)}
        restRatio={0.32}
        showGrid={false}
        border="subtle"
      >
        {options ? (
          <View style={tw`pt-1`}>
            <Pressable
              onPress={() => startEdit(options)}
              android_ripple={{ color: 'rgba(255,255,255,0.05)' }}
              style={tw`flex-row items-center rounded-2xl px-3 py-4`}
            >
              <Pencil size={20} color="#cbd5e1" strokeWidth={2} />
              <Text
                style={tw`ml-3.5 font-sans-medium text-[16px] text-slate-100`}
              >
                Edit
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void remove(options.id)}
              android_ripple={{ color: 'rgba(255,255,255,0.05)' }}
              style={tw`flex-row items-center rounded-2xl px-3 py-4`}
            >
              <Trash2 size={20} color="#f87171" strokeWidth={2} />
              <Text
                style={tw`ml-3.5 font-sans-medium text-[16px] text-red-400`}
              >
                Delete
              </Text>
            </Pressable>
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}
