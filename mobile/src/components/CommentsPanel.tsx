import {
  memo,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ComponentProps,
  type ReactNode,
} from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  Keyboard,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useAnimatedScrollHandler,
  useAnimatedRef,
  useSharedValue,
  scrollTo,
  runOnUI,
  withTiming,
  withSequence,
  withDelay,
  withRepeat,
  runOnJS,
  interpolate,
  Extrapolation,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as Crypto from 'expo-crypto';
import {
  MessageCircle,
  Trash2,
  Pencil,
  MoreVertical,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  X,
  ImagePlus,
} from 'lucide-react-native';
import { HeartIcon, SendIcon, GoogleIcon, CodeGlyph } from './icons';
import Avatar from './Avatar';
import BottomSheet from './sheets/BottomSheet';
import Collapsible from './Collapsible';
import GifPicker from './GifPicker';
import { isGiphyConfigured } from '../lib/social/giphy';
import { pickCommentImage, uploadCommentImage } from '../lib/social/commentImage';
import tw from '../lib/tw';
import { useKeyboardLift, useBlurOnKeyboardHide } from '../hooks/useKeyboard';
import { useGenericKeyboardHandler } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tapSelection, tapSuccess } from '../lib/haptics';
import {
  listComments,
  cachedComments,
  cacheComments,
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

const THREAD = '#313847';
const PANEL_BG = '#080d1a';
const CYAN = '#22d3ee';
const META_FADE: [number, number] = [10, 56];
const TITLE_FADE: [number, number] = [44, 92];
const BANNER = {
  backgroundColor: '#1a1f3a',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.1)',
};
// gap kept between the focused comment's bottom & the composer top
const REPLY_GAP = 24;

const AnimatedScrollView = Animated.createAnimatedComponent(GestureScrollView);
const INITIAL_REPLIES = 3;
const REPLY_STEP = 10;
const ROOT_BATCH = 12;
const HIGHLIGHT_MS = 1600;
const DIM_SCRIM = 0.7;
const GIF_MAX_H = 280;
const BADGE = 18;

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
  // instant-on (no fade-in) so the optimistic→saved row swap doesn't re-pulse;
  // hold briefly then fade — self-timed so it's not at the mercy of the 1s tick
  useEffect(() => {
    if (!active) return;
    glow.value = withDelay(
      800,
      withTiming(0, { duration: 650, easing: Easing.in(Easing.quad) })
    );
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

// while replying, non-target threads dim via a bg scrim on top (not by
// lowering content opacity, which double-blends overlapping avatar seams).
// scrim opacity follows the keyboard's progress on the UI thread — no
// re-render, tracks the keyboard 1:1
function DimWrap({
  shouldDim,
  progress,
  children,
}: {
  shouldDim: boolean;
  progress: SharedValue<number>;
  children: ReactNode;
}) {
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: shouldDim
      ? interpolate(progress.value, [0, 1], [0, DIM_SCRIM], Extrapolation.CLAMP)
      : 0,
  }));
  return (
    <View>
      {children}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: PANEL_BG },
          scrimStyle,
        ]}
      />
    </View>
  );
}

function CommentSkeleton() {
  const pulse = useSharedValue(0.5);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 750 }), -1, true);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const block = { backgroundColor: 'rgba(255,255,255,0.08)' };
  return (
    <View style={tw`pt-2`}>
      {[0, 1, 2, 3, 4].map((row) => (
        <View key={row} style={tw`mb-7 flex-row`}>
          <Animated.View
            style={[tw`h-11 w-11 rounded-full`, block, pulseStyle]}
          />
          <View style={tw`ml-3 flex-1`}>
            <Animated.View
              style={[tw`h-3 w-24 rounded-full`, block, pulseStyle]}
            />
            <Animated.View
              style={[tw`mt-2.5 h-3 rounded-full`, block, pulseStyle]}
            />
            <Animated.View
              style={[tw`mt-1.5 h-3 w-2/3 rounded-full`, block, pulseStyle]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function LikeButton({
  liked,
  count,
  onPress,
  size,
  style,
}: {
  liked: boolean;
  count: number;
  onPress: () => void;
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pop = useSharedValue(1);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    pop.value = withSequence(
      withTiming(1.15, { duration: 110, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 130, easing: Easing.out(Easing.quad) })
    );
  }, [liked, pop]);
  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }));
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={[tw`flex-row items-center`, style]}
    >
      <Animated.View style={heartStyle}>
        <HeartIcon size={size} color={liked ? '#ec4899' : '#64748b'} />
      </Animated.View>
      {count > 0 ? (
        <Text
          style={[
            tw`ml-1.5 font-sans-semibold text-[12px]`,
            liked ? tw`text-pink-400` : tw`text-slate-400`,
          ]}
        >
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}

function CommentGif({ uri, width }: { uri: string; width: number }) {
  // gif dims aren't stored, so size from the first decoded frame
  const [aspect, setAspect] = useState(1.4);
  const [playing, setPlaying] = useState(true);
  const imageRef = useRef<Image>(null);

  const toggle = () => {
    tapSelection();
    if (playing) {
      void imageRef.current?.stopAnimating();
      setPlaying(false);
    } else {
      void imageRef.current?.startAnimating();
      setPlaying(true);
    }
  };

  // cap tall gifs by shrinking width to keep aspect (no crop), so a portrait
  // gif renders narrower & fully visible instead of dominating the thread
  const natural = width / aspect;
  const boxH = Math.min(natural, GIF_MAX_H);
  const boxW = boxH < natural ? boxH * aspect : width;

  return (
    <View style={tw`mt-2 pl-2.5`}>
      <Pressable onPress={toggle} style={{ width: boxW }}>
        <Image
          ref={imageRef}
          source={{ uri }}
          onLoad={(event) => {
            const { width: imgW, height: imgH } = event.source;
            if (imgW > 0 && imgH > 0) setAspect(imgW / imgH);
          }}
          style={{
            width: '100%',
            height: boxH,
            borderRadius: 14,
            backgroundColor: 'rgba(255,255,255,0.05)',
          }}
          contentFit="cover"
        />
        <View
          style={[
            tw`absolute flex-row items-center rounded-md px-1.5 py-0.5`,
            { left: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.6)' },
          ]}
        >
          <Text style={tw`font-sans-bold text-[10px] text-white`}>GIF</Text>
          {playing ? (
            <Play
              size={10}
              color="#fff"
              fill="#fff"
              strokeWidth={0}
              style={tw`ml-1`}
            />
          ) : (
            <Pause
              size={10}
              color="#fff"
              fill="#fff"
              strokeWidth={0}
              style={tw`ml-1`}
            />
          )}
        </View>
      </Pressable>
    </View>
  );
}

function CommentImage({ uri, width }: { uri: string; width: number }) {
  // dims unknown until decoded — size from the first frame, mirror CommentGif
  const [aspect, setAspect] = useState(1.4);
  const natural = width / aspect;
  const boxH = Math.min(natural, GIF_MAX_H);
  const boxW = boxH < natural ? boxH * aspect : width;
  return (
    <View style={tw`mt-2 pl-2.5`}>
      <View style={{ width: boxW }}>
        <Image
          source={{ uri }}
          onLoad={(event) => {
            const { width: imgW, height: imgH } = event.source;
            if (imgW > 0 && imgH > 0) setAspect(imgW / imgH);
          }}
          style={{
            width: '100%',
            height: boxH,
            borderRadius: 14,
            backgroundColor: 'rgba(255,255,255,0.05)',
          }}
          contentFit="cover"
        />
      </View>
    </View>
  );
}

function BadgeCircle({
  size,
  ping = false,
  pingTo = 1.8,
}: {
  size: number;
  ping?: boolean;
  pingTo?: number;
}) {
  const pulse = useSharedValue(0);
  // expanding-halo ping (matches the home link icon)
  useEffect(() => {
    if (!ping) return;
    pulse.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.bezier(0, 0, 0.2, 1) }),
      -1,
      false
    );
  }, [ping, pulse]);
  const pingStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 0.75, 1], [0.5, 0, 0]),
    transform: [
      { scale: interpolate(pulse.value, [0, 0.75, 1], [1, pingTo, pingTo]) },
    ],
  }));
  const circle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: CYAN,
  };
  return (
    <View
      style={[tw`items-center justify-center`, { width: size, height: size }]}
    >
      {ping ? (
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute' }, circle, pingStyle]}
        />
      ) : null}
      <View style={[tw`items-center justify-center`, circle]}>
        <CodeGlyph size={Math.round(size * 0.6)} color="#04101f" />
      </View>
    </View>
  );
}

function CreatorBadge({ size = BADGE }: { size?: number }) {
  const [info, setInfo] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => {
          tapSelection();
          setInfo(true);
        }}
        hitSlop={10}
        style={tw`ml-1.5`}
      >
        <BadgeCircle size={size} ping />
      </Pressable>
      <BottomSheet
        open={info}
        onClose={() => setInfo(false)}
        restRatio={0.3}
        gridOpacity={0.5}
        border="cyanTop"
      >
        <View style={tw`items-center px-6 pb-4 pt-2`}>
          <BadgeCircle size={60} ping pingTo={1.5} />
          <Text
            style={tw`mt-4 font-sans-bold text-[20px] tracking-tight text-white`}
          >
            Developer&apos;s Badge
          </Text>
          <Text
            style={tw`mt-2 text-center font-sans text-[14px] leading-5 text-slate-400`}
          >
            Just a dev at your service.
          </Text>
        </View>
      </BottomSheet>
    </>
  );
}

const CommentRow = memo(function CommentRow({
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
  const rowRef = useRef<View>(null);
  const ringStyle = useAnimatedStyle(() => ({
    opacity: withTiming(expanded ? 1 : 0, { duration: 220 }),
  }));
  return (
    <View ref={rowRef} style={tw`flex-row`}>
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
          {comment.creator ? <CreatorBadge /> : null}
          <Text style={tw`ml-2 font-sans text-[13px] text-slate-500`}>
            {relativeTime(comment.createdAt, Date.now(), true)}
          </Text>
          <LikeButton
            liked={comment.liked}
            count={comment.likeCount}
            onPress={() => onToggleLike(comment)}
            size={18}
            style={tw`ml-auto`}
          />
          {comment.mine && !highlighted ? (
            <Pressable
              onPress={() => onOptions(comment)}
              hitSlop={10}
              style={tw`ml-3 pl-1`}
            >
              <MoreVertical size={18} color="#64748b" strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>
        {comment.body ? (
          <Body
            text={comment.body}
            style={tw`mt-1.5 pl-2.5 font-sans text-[15px] leading-[22px] text-slate-200`}
          />
        ) : null}
        {comment.gifUrl ? (
          <CommentGif uri={comment.gifUrl} width={220} />
        ) : null}
        {comment.imageUrl ? (
          <CommentImage uri={comment.imageUrl} width={220} />
        ) : null}
        <Pressable
          onPress={() =>
            rowRef.current?.measureInWindow((_x, screenY, _w, height) =>
              onReply(comment, screenY + height)
            )
          }
          hitSlop={8}
          style={tw`mt-2.5 self-start pl-2.5`}
        >
          <Text style={tw`font-sans-semibold text-[13px] text-slate-400`}>
            Reply
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

const ReplyRow = memo(function ReplyRow({
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
  // new reply: hold connector hidden through the highlight, then grow it in as the
  // cyan fades — self-timed to track the glow, not the 1s "is-new" tick
  useEffect(() => {
    if (!highlighted) return;
    lineGrow.value = withDelay(800, withTiming(1, { duration: 500 }));
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
            {comment.creator ? <CreatorBadge /> : null}
            <Text style={tw`ml-2 font-sans text-[12px] text-slate-500`}>
              {relativeTime(comment.createdAt, Date.now(), true)}
            </Text>
            <LikeButton
              liked={comment.liked}
              count={comment.likeCount}
              onPress={() => onToggleLike(comment)}
              size={16}
              style={tw`ml-auto`}
            />
            {comment.mine && !highlighted ? (
              <Pressable
                onPress={() => onOptions(comment)}
                hitSlop={10}
                style={tw`ml-3 pl-1`}
              >
                <MoreVertical size={16} color="#64748b" strokeWidth={2} />
              </Pressable>
            ) : null}
          </View>
          {comment.body ? (
            <Body
              text={comment.body}
              style={tw`mt-2 pl-2.5 font-sans text-[14px] leading-5 text-slate-200`}
            />
          ) : null}
          {comment.gifUrl ? (
            <CommentGif uri={comment.gifUrl} width={180} />
          ) : null}
          {comment.imageUrl ? (
            <CommentImage uri={comment.imageUrl} width={180} />
          ) : null}
          <Pressable
            onPress={() =>
              rowRef.current?.measureInWindow((_x, screenY, _w, height) =>
                onReply(comment, screenY + height)
              )
            }
            hitSlop={8}
            style={tw`mt-2 self-start pl-2.5`}
          >
            <Text style={tw`font-sans-semibold text-[12px] text-slate-400`}>
              Reply
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
});

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
  const [comments, setComments] = useState<UpdateComment[]>(() =>
    cachedComments(updateId ?? '')
  );
  const [loaded, setLoaded] = useState(
    () => cachedComments(updateId ?? '').length > 0
  );
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
  const [rootLimit, setRootLimit] = useState(ROOT_BATCH);
  const [ready, setReady] = useState(false);
  const [kbRoom, setKbRoom] = useState(0);
  const [gifOpen, setGifOpen] = useState(false);
  const [pendingGif, setPendingGif] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const svWrapRef = useRef<View>(null);
  const rowY = useRef<Record<string, { y: number; height: number }>>({});
  const rootRefs = useRef<Record<string, View | null>>({});
  const scrollH = useRef(0);
  const commentsTop = useRef(0);
  const kbSettled = useRef(0);
  const svTop = useRef(0);
  const setKbSettled = useCallback((height: number) => {
    kbSettled.current = height;
  }, []);
  const pendingBottom = useSharedValue(-1);
  const scrollTop = useSharedValue(0);
  const kbProgress = useSharedValue(0);
  const scrollFrom = useSharedValue(0);
  const scrollTarget = useSharedValue(-1);
  const scrollHV = useSharedValue(0);

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
    setRootLimit(ROOT_BATCH);
    setReplyTarget(null);
    setEditTarget(null);
    setOptions(null);
    setPendingGif(null);
    setPendingImage(null);
    listComments(updateId)
      .then((list) => {
        setComments(list);
        setLoaded(true);
      })
      .catch((err) => {
        setError(messageOf(err));
        setLoaded(true);
      });
  }, [visible, updateId]);

  useEffect(() => {
    if (updateId) cacheComments(updateId, comments);
  }, [comments, updateId]);

  // defer the (heavy) comment render until just after the entrance animation so
  // a cached thread doesn't render synchronously on mount & stall the transition
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

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

  const liftStyle = useKeyboardLift();
  useBlurOnKeyboardHide(inputRef);

  const smoothScrollTo = useCallback(
    (y: number) => {
      runOnUI((to: number) => {
        'worklet';
        scrollTo(scrollRef, 0, to, true);
      })(y);
    },
    [scrollRef]
  );

  const scrollBottomAboveKb = useCallback(
    (contentBottom: number, kbHeight: number) => {
      if (scrollH.current === 0) return;
      // composer floats insets.bottom above the raw keyboard — clear that too
      const target =
        contentBottom -
        (scrollH.current - kbHeight) -
        insets.bottom +
        REPLY_GAP;
      if (target <= scrollTop.value) return;
      smoothScrollTo(target);
    },
    [insets.bottom, smoothScrollTo]
  );

  useGenericKeyboardHandler(
    {
      onStart: (event) => {
        'worklet';
        if (event.height <= 0) {
          scrollTarget.value = -1;
          runOnJS(setKbRoom)(0);
          return;
        }
        runOnJS(setKbRoom)(event.height);
        if (pendingBottom.value < 0) {
          scrollTarget.value = -1;
          return;
        }
        scrollFrom.value = scrollTop.value;
        scrollTarget.value =
          pendingBottom.value -
          (scrollHV.value - event.height) -
          insets.bottom +
          REPLY_GAP;
      },
      onMove: (event) => {
        'worklet';
        kbProgress.value = event.progress;
        // pin scroll offset to the keyboard's own progress (same curve & UI
        // thread) so the comment rises in lockstep with it, not on a separate
        // scrollTo animation racing it
        if (scrollTarget.value > scrollFrom.value) {
          const y =
            scrollFrom.value +
            (scrollTarget.value - scrollFrom.value) * event.progress;
          scrollTo(scrollRef, 0, y, false);
        }
      },
      onEnd: (event) => {
        'worklet';
        kbProgress.value = event.progress;
        runOnJS(setKbSettled)(event.height);
        if (scrollTarget.value > scrollFrom.value && event.height > 0) {
          scrollTo(scrollRef, 0, scrollTarget.value, false);
        }
        scrollTarget.value = -1;
        pendingBottom.value = -1;
      },
    },
    [setKbSettled, setKbRoom, insets.bottom]
  );

  const reload = async () => {
    if (updateId) setComments(await listComments(updateId));
  };

  const send = async () => {
    if (!updateId) return;
    const hasAttachment = !editTarget && (!!pendingGif || !!pendingImage);
    const check = validateComment(input, hasAttachment);
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
    const gifUrl = pendingGif;
    const localImage = pendingImage;
    const id = Crypto.randomUUID();
    const optimistic: UpdateComment = {
      id,
      updateId,
      body,
      username: myName ?? '',
      avatarUrl: myAvatar,
      createdAt: new Date().toISOString(),
      mine: true,
      parentId,
      likeCount: 0,
      liked: false,
      gifUrl,
      imageUrl: localImage,
      creator: false,
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
    setPendingGif(null);
    setPendingImage(null);
    if (parentId) {
      const rootId = parentId;
      setTimeout(() => {
        rootRefs.current[rootId]?.measureInWindow((_x, screenY, _w, height) => {
          if (scrollH.current === 0) return;
          const contentBottom =
            screenY + height - svTop.current + scrollTop.value;
          const target = Math.max(0, contentBottom - scrollH.current * 0.5);
          smoothScrollTo(target);
        });
      }, 260);
    } else {
      // land on the comments section (new comment is now first), not the post top
      requestAnimationFrame(() =>
        smoothScrollTo(Math.max(0, commentsTop.current - 12))
      );
    }
    try {
      const imageUrl = localImage
        ? await uploadCommentImage(localImage)
        : null;
      await addComment(updateId, body, parentId, id, gifUrl, imageUrl);
      await reload();
    } catch (err) {
      setComments((prev) => prev.filter((item) => item.id !== id));
      setInput(check.value);
      setPendingGif(gifUrl);
      setPendingImage(localImage);
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

  const toggleLike = useCallback(
    async (comment: UpdateComment) => {
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
    },
    [ensureUsername]
  );

  const toggleReplies = useCallback((rootId: string) => {
    tapSelection();
    setExpanded((prev) => ({ ...prev, [rootId]: !prev[rootId] }));
  }, []);

  const loadMoreReplies = useCallback((rootId: string) => {
    tapSelection();
    setReplyShown((prev) => ({
      ...prev,
      [rootId]: (prev[rootId] ?? INITIAL_REPLIES) + REPLY_STEP,
    }));
  }, []);

  const startReply = useCallback(
    (comment: UpdateComment, rowScreenBottom = -1) => {
      setEditTarget(null);
      const handle = comment.username.startsWith('@')
        ? comment.username
        : `@${comment.username}`;
      const rootId = comment.parentId ?? comment.id;
      setReplyTarget({ id: rootId, handle });
      setInput(`${handle} `);
      requestAnimationFrame(() => inputRef.current?.focus());
      let contentBottom = -1;
      // measured row bottom pins the tapped comment itself; whole-thread
      // bottom (root.y + root.height) is only a fallback if measure fails
      if (rowScreenBottom >= 0) {
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
      }
    },
    [scrollBottomAboveKb]
  );

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

  const attachImage = async () => {
    setPendingGif(null);
    const uri = await pickCommentImage();
    if (uri) setPendingImage(uri);
  };

  const canSend =
    input.trim().length > 0 || !!pendingGif || !!pendingImage;
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

  // batch-mount roots per frame so a big thread opens instantly, not in one
  // blocking commit
  useEffect(() => {
    if (rootLimit >= roots.length) return undefined;
    const id = requestAnimationFrame(() =>
      setRootLimit((limit) => Math.min(limit + ROOT_BATCH, roots.length))
    );
    return () => cancelAnimationFrame(id);
  }, [rootLimit, roots.length]);

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
          contentContainerStyle={[tw`px-5`, { paddingBottom: 16 + kbRoom }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onLayout={(event) => {
            scrollH.current = event.nativeEvent.layout.height;
            scrollHV.value = event.nativeEvent.layout.height;
            svWrapRef.current?.measureInWindow((_x, screenTop) => {
              svTop.current = screenTop;
            });
          }}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
        >
          {header ? (
            <View
              onLayout={(event) => {
                commentsTop.current = event.nativeEvent.layout.height;
              }}
            >
              {header}
              <View style={tw`mb-4 mt-7 flex-row items-center`}>
                <Text
                  style={tw`font-sans-bold text-[20px] tracking-tight text-white mb-2`}
                >
                  Comments{' '}
                  <Text style={tw`font-sans text-[14px] text-white/70`}>
                    ({comments.length})
                  </Text>
                </Text>
              </View>
            </View>
          ) : null}
          {!ready ? (
            <CommentSkeleton />
          ) : comments.length === 0 ? (
            loaded ? (
              <View style={tw`items-center py-12`}>
                <MessageCircle size={30} color="#334155" strokeWidth={1.8} />
                <Text style={tw`mt-3 font-sans text-[13px] text-slate-500`}>
                  No comments yet — start the chat.
                </Text>
              </View>
            ) : (
              <CommentSkeleton />
            )
          ) : (
            roots.slice(0, rootLimit).map((root) => {
              const replies = repliesFor(root.id);
              const hasReplies = replies.length > 0;
              const isOpen = !!expanded[root.id];
              // once a thread is toggled its key exists here; keep that
              // thread's Collapsible mounted so expand & collapse both animate,
              // while never-opened threads still skip mounting reply rows
              const everOpened = root.id in expanded;
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
                  onLayout={(event) => {
                    rowY.current[root.id] = {
                      y: event.nativeEvent.layout.y,
                      height: event.nativeEvent.layout.height,
                    };
                  }}
                  style={tw`mb-9`}
                >
                  <DimWrap
                    shouldDim={!!replyTarget && replyTarget.id !== root.id}
                    progress={kbProgress}
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
                    {hasReplies && everOpened ? (
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
                        <View style={tw`h-3.5`} />
                      </Collapsible>
                    ) : null}
                    {hasReplies && !isOpen ? (
                      <View style={tw`flex-row`}>
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
                                    borderWidth: 2.5,
                                    borderColor: PANEL_BG,
                                  },
                                  avatarIndex > 0 ? { marginLeft: -10 } : null,
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
                          {/* only chevron+label toggles — avatars stay inert,
                          so near-misses on the Reply button below don't expand */}
                          <Pressable
                            onPress={() => toggleReplies(root.id)}
                            hitSlop={6}
                            style={tw`ml-1.5 flex-row items-center`}
                          >
                            <ChevronDown
                              size={16}
                              color="#94a3b8"
                              strokeWidth={2.5}
                            />
                            <Text
                              style={tw`ml-2 font-sans-medium text-[13px] text-slate-400`}
                            >
                              Show {replies.length}{' '}
                              {replies.length === 1 ? 'reply' : 'replies'}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                  </DimWrap>
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
            {pendingGif ? (
              <View style={tw`mb-2 flex-row`}>
                <View>
                  <Image
                    source={{ uri: pendingGif }}
                    style={{ width: 92, height: 92, borderRadius: 14 }}
                    contentFit="cover"
                  />
                  <Pressable
                    onPress={() => setPendingGif(null)}
                    hitSlop={8}
                    style={[
                      tw`absolute h-6 w-6 items-center justify-center rounded-full`,
                      { top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.65)' },
                    ]}
                  >
                    <X size={14} color="#fff" strokeWidth={2.5} />
                  </Pressable>
                </View>
              </View>
            ) : null}
            {pendingImage ? (
              <View style={tw`mb-2 flex-row`}>
                <View>
                  <Image
                    source={{ uri: pendingImage }}
                    style={{ width: 92, height: 92, borderRadius: 14 }}
                    contentFit="cover"
                  />
                  <Pressable
                    onPress={() => setPendingImage(null)}
                    hitSlop={8}
                    style={[
                      tw`absolute h-6 w-6 items-center justify-center rounded-full`,
                      { top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.65)' },
                    ]}
                  >
                    <X size={14} color="#fff" strokeWidth={2.5} />
                  </Pressable>
                </View>
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
              {!editTarget ? (
                <Pressable
                  onPress={() => void attachImage()}
                  hitSlop={8}
                  style={tw`mr-2`}
                >
                  <ImagePlus
                    size={22}
                    color="rgba(255,255,255,0.7)"
                    strokeWidth={2}
                  />
                </Pressable>
              ) : null}
              {!editTarget && isGiphyConfigured ? (
                <Pressable
                  onPress={() => setGifOpen(true)}
                  hitSlop={8}
                  style={tw`mr-2 rounded-md border border-white/25 px-1.5 py-0.5`}
                >
                  <Text style={tw`font-sans-bold text-[12px] text-white/70`}>
                    GIF
                  </Text>
                </Pressable>
              ) : null}
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

      <GifPicker
        open={gifOpen}
        onClose={() => setGifOpen(false)}
        onSelect={(url) => {
          setPendingImage(null);
          setPendingGif(url);
        }}
      />
    </View>
  );
}
