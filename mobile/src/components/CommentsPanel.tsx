import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ElementRef,
  type ComponentProps,
  type ReactNode,
} from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  Keyboard,
  Dimensions,
} from 'react-native';
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  useSharedValue,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
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
import { HeartIcon, ReplyIcon, SendIcon, GoogleIcon } from './icons';
import Avatar from './Avatar';
import BottomSheet from './sheets/BottomSheet';
import Collapsible from './Collapsible';
import tw from '../lib/tw';
import { useKeyboardLift, useBlurOnKeyboardHide } from '../hooks/useKeyboard';
import { useGenericKeyboardHandler } from 'react-native-keyboard-controller';
import { tapSelection, tapSuccess } from '../lib/haptics';
import {
  listComments,
  addComment,
  deleteComment,
  editComment,
  likeComment,
  unlikeComment,
  subscribeToComments,
  validateComment,
  relativeTime,
  messageOf,
  type UpdateComment,
} from '../lib/social/updates';

const DIVIDER = {
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: 'rgba(255,255,255,0.09)',
};

const THREAD = '#313847';
const RING = '#030014';
const CYAN = '#22d3ee';
const META_FADE: [number, number] = [10, 56];
const TITLE_FADE: [number, number] = [44, 92];
const BANNER = {
  backgroundColor: '#1a1f3a',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.1)',
};
const REPLY_LIFT = 40;
const KB_ESTIMATE = Math.round(Dimensions.get('window').height * 0.36);

const AnimatedScrollView = Animated.createAnimatedComponent(GestureScrollView);
const INITIAL_REPLIES = 3;
const REPLY_STEP = 10;
const HIGHLIGHT_MS = 1600;

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

function ThreadCurve({
  top,
  style,
}: {
  top: number;
  style?: ComponentProps<typeof Animated.View>['style'];
}) {
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 20,
          top,
          width: 16,
          height: 15,
          borderColor: THREAD,
          borderLeftWidth: 2,
          borderBottomWidth: 2,
          borderBottomLeftRadius: 12,
        },
        style,
      ]}
    />
  );
}

function NewGlow({
  active,
  top = -10,
  bottom = -10,
  children,
}: {
  active: boolean;
  top?: number;
  bottom?: number;
  children: ReactNode;
}) {
  const glow = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    glow.value = active ? 1 : withTiming(0, { duration: 350 });
  }, [active, glow]);
  const style = useAnimatedStyle(() => ({ opacity: glow.value }));
  return (
    <View>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: -20,
            right: -20,
            top,
            bottom,
            backgroundColor: 'rgba(34,211,238,0.12)',
          },
          style,
        ]}
      />
      {children}
    </View>
  );
}

function CommentRow({
  comment,
  onToggleLike,
  onReply,
  onOptions,
  hasLine,
  expanded,
  highlighted,
}: {
  comment: UpdateComment;
  onToggleLike: (comment: UpdateComment) => void;
  onReply: (comment: UpdateComment, rowScreenBottom?: number) => void;
  onOptions: (comment: UpdateComment) => void;
  hasLine: boolean;
  expanded: boolean;
  highlighted: boolean;
}) {
  const handle = comment.username.startsWith('@')
    ? comment.username
    : `@${comment.username}`;
  const ringStyle = useAnimatedStyle(() => ({
    opacity: withTiming(expanded ? 1 : 0, { duration: 220 }),
  }));
  return (
    <View style={tw`flex-row`}>
      <View style={tw`items-center`}>
        <View>
          <Avatar name={comment.username} size={42} uri={comment.avatarUrl} />
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: -5,
                left: -5,
                right: -5,
                bottom: -5,
                borderRadius: 999,
                borderWidth: 2,
                borderColor: '#22d3ee',
              },
              ringStyle,
            ]}
          />
        </View>
        {hasLine && !highlighted ? (
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
            {relativeTime(comment.createdAt, Date.now(), true)}
          </Text>
          {comment.mine && !highlighted ? (
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
  highlighted,
}: {
  comment: UpdateComment;
  isLast: boolean;
  onToggleLike: (comment: UpdateComment) => void;
  onReply: (comment: UpdateComment, rowScreenBottom?: number) => void;
  onOptions: (comment: UpdateComment) => void;
  highlighted: boolean;
}) {
  const rowRef = useRef<View>(null);
  const handle = comment.username.startsWith('@')
    ? comment.username
    : `@${comment.username}`;
  const lineGrow = useSharedValue(highlighted ? 0 : 1);
  useEffect(() => {
    lineGrow.value = highlighted ? 0 : withTiming(1, { duration: 400 });
  }, [highlighted, lineGrow]);
  const lineStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: lineGrow.value }],
  }));
  const curveStyle = useAnimatedStyle(() => ({ opacity: lineGrow.value }));
  return (
    <View ref={rowRef} style={tw`flex-row`}>
      <View style={tw`w-9`}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 20,
              top: 0,
              bottom: isLast ? undefined : 0,
              height: isLast ? 30 : undefined,
              width: 2,
              backgroundColor: THREAD,
              transformOrigin: ['50%', 0, 0],
            },
            lineStyle,
          ]}
        />
        <ThreadCurve top={24} style={curveStyle} />
      </View>
      <View style={tw`flex-1 flex-row pt-6`}>
        <Avatar name={comment.username} size={30} uri={comment.avatarUrl} />
        <View style={tw`ml-2.5 flex-1`}>
          <View style={tw`flex-row items-center`}>
            <Text style={tw`font-sans-semibold text-[14px] text-white`}>
              {handle}
            </Text>
            <Text style={tw`ml-2 font-sans text-[12px] text-slate-500`}>
              {relativeTime(comment.createdAt, Date.now(), true)}
            </Text>
            {comment.mine && !highlighted ? (
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
          <View style={tw`mt-2 flex-row items-center pl-2.5`}>
            <Pressable onPress={() => onToggleLike(comment)} hitSlop={8}>
              <Text
                style={[
                  tw`font-sans-semibold text-[12px]`,
                  comment.liked ? tw`text-pink-400` : tw`text-slate-400`,
                ]}
              >
                {comment.liked ? 'Liked' : 'Like'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() =>
                rowRef.current?.measureInWindow((_x, screenY, _w, height) =>
                  onReply(comment, screenY + height)
                )
              }
              hitSlop={8}
              style={tw`ml-5`}
            >
              <Text style={tw`font-sans-semibold text-[12px] text-slate-400`}>
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
  header,
  barCategory,
  barTimestamp,
  barTitle,
  barVersion,
}: {
  updateId: string | null;
  visible: boolean;
  myName: string | null;
  myAvatar: string | null;
  ensureUsername: () => Promise<boolean>;
  onBack: () => void;
  header?: ReactNode;
  barCategory?: string;
  barTimestamp?: string;
  barTitle?: string;
  barVersion?: string;
}) {
  const [comments, setComments] = useState<UpdateComment[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [replyShown, setReplyShown] = useState<Record<string, number>>({});
  const [replyTarget, setReplyTarget] = useState<{
    id: string;
    handle: string;
  } | null>(null);
  const [editTarget, setEditTarget] = useState<{ id: string } | null>(null);
  const [options, setOptions] = useState<UpdateComment | null>(null);
  const [, setTick] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ElementRef<typeof GestureScrollView>>(null);
  const svWrapRef = useRef<View>(null);
  const rowY = useRef<Record<string, { y: number; height: number }>>({});
  const rootRefs = useRef<Record<string, View | null>>({});
  const scrollH = useRef(0);
  const kbSettled = useRef(0);
  const lastKbHeight = useRef(KB_ESTIMATE);
  const svTop = useRef(0);
  const setKbSettled = useCallback((height: number) => {
    kbSettled.current = height;
    if (height > 0) lastKbHeight.current = height;
  }, []);
  const pendingBottom = useSharedValue(-1);
  const scrollTop = useSharedValue(0);

  const barMetaStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollTop.value,
      META_FADE,
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));
  const barTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollTop.value,
      TITLE_FADE,
      [0, 1],
      Extrapolation.CLAMP
    ),
    transform: [
      {
        translateY: interpolate(
          scrollTop.value,
          TITLE_FADE,
          [9, 0],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollTop.value = event.contentOffset.y;
  });

  useEffect(() => {
    if (!visible || !updateId) return;
    setError(null);
    setInput('');
    setExpanded({});
    setReplyShown({});
    setReplyTarget(null);
    setEditTarget(null);
    setOptions(null);
    listComments(updateId)
      .then(setComments)
      .catch((err) => setError(messageOf(err)));
  }, [visible, updateId]);

  useEffect(() => {
    if (!visible || !updateId) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        listComments(updateId)
          .then(setComments)
          .catch(() => undefined);
      }, 250);
    };
    const unsubscribe = subscribeToComments(updateId, refresh);
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [visible, updateId]);

  useEffect(() => {
    if (!visible) return undefined;
    const id = setInterval(() => setTick((count) => count + 1), 1000);
    return () => clearInterval(id);
  }, [visible]);

  const liftStyle = useKeyboardLift();
  useBlurOnKeyboardHide(inputRef);

  const scrollBottomAboveKb = useCallback(
    (contentBottom: number, kbHeight: number) => {
      if (scrollH.current === 0) return;
      const target = contentBottom - (scrollH.current - kbHeight) - REPLY_LIFT;
      if (target <= scrollTop.value) return;
      scrollRef.current?.scrollTo({ y: target, animated: true });
    },
    []
  );

  useGenericKeyboardHandler(
    {
      onEnd: (event) => {
        'worklet';
        runOnJS(setKbSettled)(event.height);
        if (pendingBottom.value >= 0 && event.height > 0) {
          runOnJS(scrollBottomAboveKb)(pendingBottom.value, event.height);
        }
        pendingBottom.value = -1;
      },
    },
    [scrollBottomAboveKb, setKbSettled]
  );

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

    const body = check.value;
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
    if (parentId) {
      setExpanded((prev) => ({ ...prev, [parentId]: true }));
      setReplyShown((prev) => ({
        ...prev,
        [parentId]: Number.MAX_SAFE_INTEGER,
      }));
    }
    setInput('');
    setReplyTarget(null);
    if (parentId) {
      const rootId = parentId;
      setTimeout(() => {
        rootRefs.current[rootId]?.measureInWindow((_x, screenY, _w, height) => {
          if (scrollH.current === 0) return;
          const contentBottom =
            screenY + height - svTop.current + scrollTop.value;
          const target = Math.max(0, contentBottom - scrollH.current * 0.5);
          scrollRef.current?.scrollTo({ y: target, animated: true });
        });
      }, 260);
    } else {
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({ y: 0, animated: true })
      );
    }
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

  const toggleLike = async (comment: UpdateComment) => {
    if (!(await ensureUsername())) return;
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

  const loadMoreReplies = (rootId: string) => {
    tapSelection();
    setReplyShown((prev) => ({
      ...prev,
      [rootId]: (prev[rootId] ?? INITIAL_REPLIES) + REPLY_STEP,
    }));
  };

  const startReply = (comment: UpdateComment, rowScreenBottom = -1) => {
    setEditTarget(null);
    const handle = comment.username.startsWith('@')
      ? comment.username
      : `@${comment.username}`;
    const rootId = comment.parentId ?? comment.id;
    setReplyTarget({ id: rootId, handle });
    setInput(`${handle} `);
    requestAnimationFrame(() => inputRef.current?.focus());
    let contentBottom = -1;
    if (comment.parentId && rowScreenBottom >= 0) {
      contentBottom = rowScreenBottom - svTop.current + scrollTop.value;
    } else {
      const root = rowY.current[rootId];
      if (root) contentBottom = root.y + root.height;
    }
    if (contentBottom < 0) return;
    if (kbSettled.current > 0) {
      scrollBottomAboveKb(contentBottom, kbSettled.current);
      pendingBottom.value = -1;
    } else {
      pendingBottom.value = contentBottom;
      if (lastKbHeight.current > 0) {
        scrollBottomAboveKb(contentBottom, lastKbHeight.current);
      }
    }
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
  const composerPlaceholder = replyTarget
    ? ''
    : editTarget
      ? 'Edit your comment…'
      : 'Add a comment…';
  const mentionPrefix =
    replyTarget && input.startsWith(`${replyTarget.handle} `)
      ? replyTarget.handle
      : '';
  const inputRest = input.slice(mentionPrefix.length);
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
      <View style={tw`flex-row items-center px-3 pb-2 pt-2`}>
        <Pressable onPress={onBack} hitSlop={8} style={tw`p-1`}>
          <ChevronLeft size={26} color="#cbd5e1" strokeWidth={2} />
        </Pressable>
        {barTitle || barCategory ? (
          <View style={tw`ml-1 flex-1 justify-center`} pointerEvents="none">
            <Animated.View style={[tw`flex-row items-center`, barMetaStyle]}>
              {barCategory ? (
                <View
                  style={[
                    tw`rounded-full px-2.5 py-1`,
                    { backgroundColor: 'rgba(34,211,238,0.15)' },
                  ]}
                >
                  <Text
                    style={[
                      tw`font-sans-semibold text-[12px]`,
                      { color: CYAN },
                    ]}
                    numberOfLines={1}
                  >
                    {barCategory}
                  </Text>
                </View>
              ) : null}
              {barTimestamp ? (
                <Text
                  style={tw`ml-2 font-sans text-[12.5px] text-slate-500`}
                  numberOfLines={1}
                >
                  {barTimestamp}
                </Text>
              ) : null}
            </Animated.View>
            {barTitle ? (
              <Animated.View
                style={[
                  tw`absolute inset-0 flex-row items-center`,
                  barTitleStyle,
                ]}
              >
                <Text
                  style={tw`font-sans-bold text-[16px] tracking-tight text-white`}
                  numberOfLines={1}
                >
                  {barTitle}
                </Text>
              </Animated.View>
            ) : null}
          </View>
        ) : null}
        {barVersion ? (
          <Animated.View style={barMetaStyle}>
            <Text style={tw`ml-2 font-sans text-[12.5px] text-white/35`}>
              v{barVersion}
            </Text>
          </Animated.View>
        ) : null}
      </View>

      <View ref={svWrapRef} style={tw`flex-1`}>
        <AnimatedScrollView
          ref={scrollRef}
          style={tw`flex-1`}
          contentContainerStyle={tw`px-5 pb-4`}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onLayout={(event) => {
            scrollH.current = event.nativeEvent.layout.height;
            svWrapRef.current?.measureInWindow((_x, screenTop) => {
              svTop.current = screenTop;
            });
          }}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
        >
          {header ? (
            <View>
              {header}
              <View style={tw`mb-4 mt-7 flex-row items-center`}>
                <Text
                  style={tw`font-sans-bold text-[20px] tracking-tight text-white`}
                >
                  Comments{' '}
                  <Text style={tw`font-sans text-[14px] text-white/70`}>
                    ({comments.length})
                  </Text>
                </Text>
              </View>
            </View>
          ) : null}
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
              const shown = replyShown[root.id] ?? INITIAL_REPLIES;
              const visibleReplies = replies.slice(0, shown);
              const moreCount = replies.length - visibleReplies.length;
              const rootNew =
                root.mine &&
                Date.now() - new Date(root.createdAt).getTime() < HIGHLIGHT_MS;
              return (
                <Animated.View
                  key={root.id}
                  ref={(node: View | null) => {
                    rootRefs.current[root.id] = node;
                  }}
                  entering={
                    root.mine && !root.id.startsWith('temp-')
                      ? undefined
                      : FadeIn.duration(200)
                  }
                  onLayout={(event) => {
                    rowY.current[root.id] = {
                      y: event.nativeEvent.layout.y,
                      height: event.nativeEvent.layout.height,
                    };
                  }}
                  style={[
                    tw`mb-5 pb-5`,
                    index < roots.length - 1 ? DIVIDER : null,
                  ]}
                >
                  <NewGlow active={rootNew}>
                    <CommentRow
                      comment={root}
                      onToggleLike={toggleLike}
                      onReply={startReply}
                      onOptions={setOptions}
                      hasLine={hasReplies}
                      expanded={isOpen}
                      highlighted={rootNew}
                    />
                  </NewGlow>
                  {hasReplies ? (
                    <Collapsible open={isOpen}>
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
                              bottom: 0,
                              width: 2,
                              backgroundColor: THREAD,
                            }}
                          />
                        </View>
                        <View style={tw`flex-row items-center pt-4`}>
                          <ChevronUp
                            size={16}
                            color="#64748b"
                            strokeWidth={2.5}
                          />
                          <Text
                            style={tw`ml-2 font-sans-medium text-[13px] text-slate-400`}
                          >
                            Hide replies
                          </Text>
                        </View>
                      </Pressable>
                      {visibleReplies.map((reply, replyIndex) => {
                        const replyNew =
                          reply.mine &&
                          Date.now() - new Date(reply.createdAt).getTime() <
                            HIGHLIGHT_MS;
                        return (
                          <NewGlow
                            key={reply.id}
                            active={replyNew}
                            top={12}
                            bottom={-12}
                          >
                            <ReplyRow
                              comment={reply}
                              isLast={
                                replyIndex === visibleReplies.length - 1 &&
                                moreCount <= 0
                              }
                              onToggleLike={toggleLike}
                              onReply={startReply}
                              onOptions={setOptions}
                              highlighted={replyNew}
                            />
                          </NewGlow>
                        );
                      })}
                      {moreCount > 0 ? (
                        <Pressable
                          onPress={() => loadMoreReplies(root.id)}
                          hitSlop={6}
                          style={tw`flex-row`}
                        >
                          <View style={tw`w-9`}>
                            <View
                              style={{
                                position: 'absolute',
                                left: 20,
                                top: 0,
                                height: 30,
                                width: 2,
                                backgroundColor: THREAD,
                              }}
                            />
                            <ThreadCurve top={24} />
                          </View>
                          <View style={tw`flex-row items-center pt-5`}>
                            <ChevronDown
                              size={16}
                              color="#94a3b8"
                              strokeWidth={2.5}
                            />
                            <Text
                              style={tw`ml-2 font-sans-medium text-[13px] text-slate-300`}
                            >
                              View {moreCount} more{' '}
                              {moreCount === 1 ? 'reply' : 'replies'}
                            </Text>
                          </View>
                        </Pressable>
                      ) : null}
                    </Collapsible>
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
        </AnimatedScrollView>
      </View>

      <Animated.View style={[tw`px-4 pt-2`, liftStyle]}>
        {error ? (
          <Text style={tw`mb-2 px-1 font-sans text-[12px] text-red-400`}>
            {error}
          </Text>
        ) : null}
        {myName ? (
          <>
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
              <Avatar name={myName} size={34} uri={myAvatar} />
              <View style={tw`mx-3 flex-1`}>
                <TextInput
                  ref={inputRef}
                  onChangeText={setInput}
                  onKeyPress={(event) => {
                    if (
                      event.nativeEvent.key === 'Backspace' &&
                      input.length === 0 &&
                      replyTarget
                    ) {
                      setReplyTarget(null);
                    }
                  }}
                  placeholder={composerPlaceholder}
                  placeholderTextColor="#828ea4"
                  multiline
                  style={[
                    tw`max-h-24 font-sans text-[16px] text-white`,
                    {
                      includeFontPadding: false,
                      paddingTop: 0,
                      paddingBottom: 0,
                    },
                  ]}
                >
                  <Text style={tw`text-white`}>
                    {mentionPrefix ? (
                      <Text style={tw`font-sans-semibold text-primary`}>
                        {mentionPrefix}
                      </Text>
                    ) : null}
                    {inputRest}
                  </Text>
                </TextInput>
              </View>
              <Pressable
                onPress={() => void send()}
                disabled={!canSend}
                hitSlop={8}
                style={tw`pr-1.5`}
              >
                <SendIcon size={28} color={canSend ? '#3b9eff' : '#475569'} />
              </Pressable>
            </LinearGradient>
          </>
        ) : (
          <View style={tw`mb-1`}>
            <Text
              style={tw`mb-2.5 text-center font-sans text-[13px] text-slate-400`}
            >
              Sign in to join the conversation
            </Text>
            <Pressable
              onPress={() => void ensureUsername()}
              style={({ pressed }) => [
                tw`flex-row items-center justify-center rounded-full bg-white py-3.5`,
                pressed ? { transform: [{ scale: 0.98 }] } : null,
              ]}
            >
              <GoogleIcon size={18} />
              <Text
                style={tw`ml-3 font-sans-semibold text-[15px] text-[#1f1f1f]`}
              >
                Sign in with Google
              </Text>
            </Pressable>
          </View>
        )}
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
