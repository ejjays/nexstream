import {
  memo,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type RefObject,
} from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  RefreshControl,
  type NativeSyntheticEvent,
  type TextLayoutEventData,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useScreenSize } from '../hooks/useScreenSize';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView, BlurTargetView } from 'expo-blur';
import { Image } from 'expo-image';
import {
  MessageCircle,
  Inbox,
  CloudOff,
  AlertCircle,
} from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import tw from '../lib/tw';
import { tapSelection, tapSuccess } from '../lib/haptics';
import BottomSheet from '../components/BottomSheet';
import UpdateDetailSheet from '../components/UpdateDetailSheet';
import DotPattern, { useDotTouch } from '../components/DotPattern';
import ShootingStars from '../components/ShootingStars';
import {
  isSupabaseConfigured,
  listUpdates,
  listReactions,
  getExistingUserId,
  fetchUsername,
  setUsername,
  toggleReaction,
  summarizeReactions,
  planReactionToggle,
  validateUsername,
  relativeTime,
  type Update,
  type UpdateCategory,
  type ReactionRow,
  type ReactionTally,
} from '../lib/updates';
import { signInWithGoogle } from '../lib/googleAuth';

type IconType = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

const CARD = '#16203a';
const CARD_GRADIENT = ['#16203a', '#0d1320'] as const;
const AUTHOR_NAME = 'NexStream';
const RING_COLORS = ['#67e8f9', '#06b6d4', '#0d9488'] as const;
const PROFILE_PIC =
  'https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/69d79c77-7a14-4d6e-a6e4-6aadb16f4fdb/dfsn8ah-641d63c4-993c-4e9b-bd65-84c56cae98b7.jpg/v1/fill/w_887,h_901,q_75,strp/stitch_pfp_by_nintendgod29_dfsn8ah-fullview.jpg?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9OTAxIiwicGF0aCI6Ii9mLzY5ZDc5Yzc3LTdhMTQtNGQ2ZS1hNmU0LTZhYWRiMTZmNGZkYi9kZnNuOGFoLTY0MWQ2M2M0LTk5M2MtNGU5Yi1iZDY1LTg0YzU2Y2FlOThiNy5qcGciLCJ3aWR0aCI6Ijw9ODg3In1dXSwiYXVkIjpbInVybjpzZXJ2aWNlOmltYWdlLm9wZXJhdGlvbnMiXX0.-UyergOcM2CjE5ClzNhFnYNyqhXrPQGEsklnMEQbTNQ';

const CATEGORY_META: Record<UpdateCategory, { label: string; color: string }> =
  {
    feature: { label: 'Feature', color: '#22d3ee' },
    optimization: { label: 'Boost', color: '#a78bfa' },
    fix: { label: 'Fix', color: '#34d399' },
  };

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

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

function avatarColor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 100000;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? '#22d3ee';
}

function Avatar({ name, size }: { name: string; size: number }) {
  const trimmed = name.trim();
  const seed = trimmed.length > 0 ? trimmed : '?';
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

function AuthorAvatar() {
  return (
    <LinearGradient
      colors={RING_COLORS}
      start={{ x: 0, y: 1 }}
      end={{ x: 1, y: 0 }}
      style={[tw`rounded-full`, { padding: 2 }]}
    >
      <Image
        source={{ uri: PROFILE_PIC }}
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          borderWidth: 2,
          borderColor: CARD,
        }}
        contentFit="cover"
        transition={200}
      />
    </LinearGradient>
  );
}

function ReactionPills({
  tallies,
  onReact,
  overlay,
  blurTarget,
}: {
  tallies: ReactionTally[];
  onReact: (emoji: string) => void;
  overlay: boolean;
  blurTarget?: RefObject<View | null>;
}) {
  return (
    <View style={tw`flex-row items-center`}>
      {tallies.map((tally) => {
        if (overlay) {
          return (
            <Pressable
              key={tally.emoji}
              onPress={() => onReact(tally.emoji)}
              style={[
                tw`mr-1.5 overflow-hidden rounded-full border`,
                {
                  borderColor: tally.mine ? '#67e8f9' : 'rgba(255,255,255,0.3)',
                },
              ]}
            >
              <BlurView
                blurMethod="dimezisBlurViewSdk31Plus"
                blurTarget={blurTarget}
                intensity={14}
                blurReductionFactor={6}
                tint="light"
                style={tw`flex-row items-center px-2 py-1.5`}
              >
                <View
                  pointerEvents="none"
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      backgroundColor: tally.mine
                        ? 'rgba(34,211,238,0.32)'
                        : 'rgba(255,255,255,0.08)',
                    },
                  ]}
                />
                <Text style={tw`text-[13px]`}>{tally.emoji}</Text>
                {tally.count > 0 ? (
                  <Text
                    style={tw`ml-1 font-sans-semibold text-[11px] text-white`}
                  >
                    {tally.count}
                  </Text>
                ) : null}
              </BlurView>
            </Pressable>
          );
        }
        return (
          <Pressable
            key={tally.emoji}
            onPress={() => onReact(tally.emoji)}
            style={[
              tw`mr-1.5 flex-row items-center rounded-full border px-2 py-1.5`,
              tally.mine
                ? tw`border-primary bg-primary/15`
                : tw`border-white/10 bg-white/5`,
            ]}
          >
            <Text style={tw`text-[13px]`}>{tally.emoji}</Text>
            {tally.count > 0 ? (
              <Text
                style={[
                  tw`ml-1 font-sans-semibold text-[11px]`,
                  tally.mine ? tw`text-primary` : tw`text-slate-400`,
                ]}
              >
                {tally.count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function CommentButton({
  onPress,
  overlay,
  blurTarget,
}: {
  onPress: () => void;
  overlay: boolean;
  blurTarget?: RefObject<View | null>;
}) {
  if (overlay) {
    return (
      <Pressable
        onPress={onPress}
        style={[
          tw`h-9 w-9 overflow-hidden rounded-full border`,
          { borderColor: 'rgba(255,255,255,0.3)' },
        ]}
      >
        <BlurView
          blurMethod="dimezisBlurViewSdk31Plus"
          blurTarget={blurTarget}
          intensity={14}
          blurReductionFactor={6}
          tint="light"
          style={tw`flex-1 items-center justify-center`}
        >
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'rgba(255,255,255,0.08)' },
            ]}
          />
          <MessageCircle size={16} color="#ffffff" strokeWidth={2} />
        </BlurView>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={tw`h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5`}
    >
      <MessageCircle size={16} color="#94a3b8" strokeWidth={2} />
    </Pressable>
  );
}

const BODY_CLAMP = 3;
const MORE_LABEL = 'see more';
const MORE_PAD = 14;

type ClampState =
  | { kind: 'measuring' }
  | { kind: 'full' }
  | { kind: 'inline'; head: string }
  | { kind: 'below' };

function ClampedBody({ text, onMore }: { text: string; onMore: () => void }) {
  const [state, setState] = useState<ClampState>({ kind: 'measuring' });
  const bodyStyle = tw`font-sans text-[14px] leading-5 text-white/70`;

  const measure = (e: NativeSyntheticEvent<TextLayoutEventData>) => {
    const { lines } = e.nativeEvent;
    if (lines.length <= BODY_CLAMP) {
      setState({ kind: 'full' });
      return;
    }
    const cleaned = lines
      .slice(0, BODY_CLAMP)
      .map((line) => line.text)
      .join('')
      .replace(/\s+$/u, '');
    if (cleaned.length === 0) {
      setState({ kind: 'below' });
      return;
    }
    const head = cleaned
      .slice(0, Math.max(0, cleaned.length - MORE_PAD))
      .replace(/\s+$/u, '');
    setState({ kind: 'inline', head });
  };

  if (state.kind === 'full') {
    return <Text style={[tw`mt-1`, bodyStyle]}>{text}</Text>;
  }

  if (state.kind === 'inline') {
    return (
      <Text style={[tw`mt-1`, bodyStyle]} numberOfLines={BODY_CLAMP}>
        {state.head}…{' '}
        <Text onPress={onMore} style={tw`font-sans-semibold text-primary`}>
          {MORE_LABEL}
        </Text>
      </Text>
    );
  }

  if (state.kind === 'below') {
    return (
      <View style={tw`mt-1`}>
        <Text style={bodyStyle} numberOfLines={BODY_CLAMP}>
          {text}
        </Text>
        <Pressable onPress={onMore} hitSlop={8} style={tw`mt-1 self-start`}>
          <Text style={tw`font-sans-semibold text-[13px] text-primary`}>
            {MORE_LABEL}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={tw`mt-1`}>
      <Text style={bodyStyle} numberOfLines={BODY_CLAMP}>
        {text}
      </Text>
      <Text
        style={[bodyStyle, tw`absolute opacity-0`, { left: 0, right: 0 }]}
        onTextLayout={measure}
      >
        {text}
      </Text>
    </View>
  );
}

function PostCard({
  update,
  tallies,
  onReact,
  onOpenComments,
  onOpen,
}: {
  update: Update;
  tallies: ReactionTally[];
  onReact: (emoji: string) => void;
  onOpenComments: () => void;
  onOpen: () => void;
}) {
  const meta = CATEGORY_META[update.category];
  const blurTarget = useRef<View | null>(null);
  return (
    <LinearGradient
      colors={CARD_GRADIENT}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        tw`mb-4 overflow-hidden rounded-[28px] border border-cyan-400/40`,
        { boxShadow: '0px 0px 16px 1px rgba(34, 211, 238, 0.35)' },
      ]}
    >
      <View style={tw`flex-row items-center px-5 pb-3 pt-5`}>
        <AuthorAvatar />
        <View style={tw`ml-3 flex-1`}>
          <Text style={tw`font-sans-semibold text-[14px] text-white`}>
            {AUTHOR_NAME}
          </Text>
          <View style={tw`mt-0.5 flex-row items-center`}>
            <Text style={tw`font-sans text-[12px] text-white/40`}>
              {relativeTime(update.publishedAt)}
            </Text>
            <View
              style={[
                tw`ml-2 rounded-full px-2 py-0.5`,
                { backgroundColor: `${meta.color}1a` },
              ]}
            >
              <Text
                style={[
                  tw`font-sans-semibold text-[11px]`,
                  { color: meta.color },
                ]}
              >
                {meta.label}
              </Text>
            </View>
            {update.version ? (
              <Text style={tw`ml-2 font-sans text-[11px] text-white/30`}>
                v{update.version}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <Pressable onPress={onOpen} style={tw`px-5 pb-4`}>
        <Text style={tw`font-sans-semibold text-[15px] leading-5 text-white`}>
          {update.title}
        </Text>
        <ClampedBody text={update.body} onMore={onOpen} />
      </Pressable>

      {update.imageUrl ? (
        <View style={tw`relative mx-3 mb-3 overflow-hidden rounded-2xl`}>
          <Pressable onPress={onOpen}>
            <BlurTargetView ref={blurTarget}>
              <Image
                source={{ uri: update.imageUrl }}
                style={{ width: '100%', aspectRatio: 4 / 5 }}
                contentFit="cover"
                transition={200}
              />
            </BlurTargetView>
          </Pressable>
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.55)']}
            style={tw`absolute inset-x-0 bottom-0 h-28`}
            pointerEvents="none"
          />
          <View
            style={tw`absolute inset-x-0 bottom-4 flex-row items-center justify-between px-4`}
          >
            <ReactionPills
              tallies={tallies}
              onReact={onReact}
              overlay
              blurTarget={blurTarget}
            />
            <CommentButton
              onPress={onOpenComments}
              overlay
              blurTarget={blurTarget}
            />
          </View>
        </View>
      ) : (
        <View style={tw`flex-row items-center justify-between px-5 pb-5`}>
          <ReactionPills tallies={tallies} onReact={onReact} overlay={false} />
          <CommentButton onPress={onOpenComments} overlay={false} />
        </View>
      )}
    </LinearGradient>
  );
}

function GoogleG({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

function UsernameSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (username: string, userId: string) => void;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsName, setNeedsName] = useState(false);

  const reset = () => {
    setValue('');
    setError(null);
    setNeedsName(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const finish = (username: string, userId: string) => {
    tapSuccess();
    reset();
    onSaved(username, userId);
  };

  const google = async () => {
    setBusy(true);
    setError(null);
    try {
      const userId = await signInWithGoogle();
      if (!userId) return;
      const existing = await fetchUsername(userId);
      if (existing) {
        finish(existing, userId);
        return;
      }
      setNeedsName(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const check = validateUsername(value);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const userId = await setUsername(check.value);
      finish(check.value, userId);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={close}>
      <View style={tw`items-center`}>
        <Avatar
          name={needsName && value.trim().length > 0 ? value : 'G'}
          size={76}
        />
        <Text
          style={tw`mt-4 font-sans-bold text-[22px] tracking-tight text-white`}
        >
          {needsName ? 'Pick a username' : 'Sign in'}
        </Text>
        <Text
          style={tw`mt-1.5 text-center font-sans text-[13px] leading-5 text-slate-400`}
        >
          {needsName
            ? 'This is how you show up on reactions and comments.'
            : 'Sign in with Google to react and comment.'}
        </Text>
      </View>
      {needsName ? (
        <>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder="username"
            placeholderTextColor="#5b6472"
            autoCapitalize="none"
            autoCorrect={false}
            textAlign="center"
            style={tw`mt-5 rounded-2xl border border-white/15 bg-black/30 px-4 py-3 font-sans text-[16px] text-white`}
          />
          {error ? (
            <Text
              style={tw`mt-2 text-center font-sans text-[12px] text-red-400`}
            >
              {error}
            </Text>
          ) : null}
          <Pressable
            onPress={() => void save()}
            disabled={busy}
            style={[
              tw`mt-4 items-center rounded-2xl py-3.5`,
              busy ? tw`bg-slate-700` : tw`bg-primary`,
            ]}
          >
            <Text
              style={[tw`font-sans-semibold text-[15px]`, { color: '#04101f' }]}
            >
              Save
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          {error ? (
            <Text
              style={tw`mt-4 text-center font-sans text-[12px] text-red-400`}
            >
              {error}
            </Text>
          ) : null}
          <Pressable
            onPress={() => void google()}
            disabled={busy}
            style={[
              tw`mt-5 flex-row items-center justify-center rounded-2xl bg-white py-3.5`,
              busy ? tw`opacity-60` : null,
            ]}
          >
            <GoogleG size={18} />
            <Text
              style={tw`ml-3 font-sans-semibold text-[15px] text-[#1f1f1f]`}
            >
              Continue with Google
            </Text>
          </Pressable>
        </>
      )}
    </BottomSheet>
  );
}

function UpdatesSkeleton() {
  const pulse = useSharedValue(0.4);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.9, { duration: 1000 }), -1, true);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View style={pulseStyle}>
      {['a', 'b'].map((id) => (
        <LinearGradient
          key={id}
          colors={CARD_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={tw`mb-4 rounded-[28px] border border-white/5 p-5`}
        >
          <View style={tw`flex-row items-center`}>
            <View
              style={[
                tw`bg-white/10`,
                { width: 40, height: 40, borderRadius: 20 },
              ]}
            />
            <View style={tw`ml-3`}>
              <View style={tw`h-3 w-28 rounded-full bg-white/10`} />
              <View style={tw`mt-2 h-2 w-16 rounded-full bg-white/5`} />
            </View>
          </View>
          <View style={tw`mt-5 h-3 w-1/2 rounded-full bg-white/10`} />
          <View style={tw`mt-3 h-2.5 w-full rounded-full bg-white/5`} />
          <View style={tw`mt-2 h-2.5 w-4/5 rounded-full bg-white/5`} />
          <View style={tw`mt-5 flex-row`}>
            <View style={tw`mr-2 h-7 w-11 rounded-full bg-white/5`} />
            <View style={tw`mr-2 h-7 w-11 rounded-full bg-white/5`} />
            <View style={tw`h-7 w-11 rounded-full bg-white/5`} />
          </View>
        </LinearGradient>
      ))}
    </Animated.View>
  );
}

function Notice({
  Icon,
  title,
  body,
}: {
  Icon: IconType;
  title: string;
  body: string;
}) {
  return (
    <View style={tw`mt-16 items-center px-8`}>
      <View
        style={tw`h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-white/5`}
      >
        <Icon size={26} color="#475569" strokeWidth={1.8} />
      </View>
      <Text style={tw`mt-4 font-sans-semibold text-[16px] text-slate-200`}>
        {title}
      </Text>
      <Text
        style={tw`mt-1.5 text-center font-sans text-[13px] leading-5 text-slate-500`}
      >
        {body}
      </Text>
    </View>
  );
}

type FeedData = {
  updates: Update[];
  reactions: ReactionRow[];
  userId: string | null;
  username: string | null;
};

function UpdatesScreen({ visible }: { visible: boolean }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, { duration: 160 });
  }, [visible, progress]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const { touchX, touchY, active, touchHandlers } = useDotTouch();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useScreenSize();
  const headerH = insets.top + 70;
  const cornerR = 44;
  const surroundPath = `M0 0 L${screenW} 0 L${screenW} ${headerH + cornerR} Q${screenW} ${headerH} ${screenW - cornerR} ${headerH} L${cornerR} ${headerH} Q0 ${headerH} 0 ${headerH + cornerR} Z`;

  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [detailUpdate, setDetailUpdate] = useState<Update | null>(null);
  const [detailComments, setDetailComments] = useState(false);
  const [usernameOpen, setUsernameOpen] = useState(false);
  const usernameResolver = useRef<((ok: boolean) => void) | null>(null);

  const feedQuery = useQuery({
    queryKey: ['updatesFeed'],
    enabled: isSupabaseConfigured && visible,
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<FeedData> => {
      const list = await listUpdates();
      const [reactions, existingId] = await Promise.all([
        listReactions(list.map((item) => item.id)),
        getExistingUserId(),
      ]);
      const username = existingId ? await fetchUsername(existingId) : null;
      return { updates: list, reactions, userId: existingId, username };
    },
  });

  const updates = feedQuery.data?.updates ?? [];
  const reactionRows = feedQuery.data?.reactions ?? [];
  const userId = feedQuery.data?.userId ?? null;
  const myName = feedQuery.data?.username ?? null;

  const ensureUsername = (): Promise<boolean> => {
    if (myName) return Promise.resolve(true);
    setUsernameOpen(true);
    return new Promise((resolve) => {
      usernameResolver.current = resolve;
    });
  };

  const onUsernameSaved = (username: string, savedId: string) => {
    queryClient.setQueryData<FeedData>(['updatesFeed'], (old) =>
      old ? { ...old, userId: savedId, username } : old
    );
    setUsernameOpen(false);
    usernameResolver.current?.(true);
    usernameResolver.current = null;
  };

  const onUsernameClose = () => {
    setUsernameOpen(false);
    usernameResolver.current?.(false);
    usernameResolver.current = null;
  };

  const doReact = (updateId: string, emoji: string, uid: string) => {
    tapSelection();
    const previous = reactionRows;
    const action = planReactionToggle(previous, updateId, emoji, uid);
    const next =
      action === 'insert'
        ? [...previous, { updateId, emoji, userId: uid }]
        : previous.filter(
            (row) =>
              !(
                row.updateId === updateId &&
                row.emoji === emoji &&
                row.userId === uid
              )
          );
    queryClient.setQueryData<FeedData>(['updatesFeed'], (old) =>
      old ? { ...old, reactions: next } : old
    );
    toggleReaction(updateId, emoji, previous).catch((err) => {
      queryClient.setQueryData<FeedData>(['updatesFeed'], (old) =>
        old ? { ...old, reactions: previous } : old
      );
      setError(messageOf(err));
    });
  };

  const onReact = async (update: Update, emoji: string) => {
    if (!(await ensureUsername())) return;
    const uid =
      queryClient.getQueryData<FeedData>(['updatesFeed'])?.userId ?? null;
    if (uid) doReact(update.id, emoji, uid);
  };

  const openDetail = (update: Update) => {
    tapSelection();
    setDetailComments(false);
    setDetailUpdate(update);
  };

  const openDetailComments = (update: Update) => {
    tapSelection();
    setDetailComments(true);
    setDetailUpdate(update);
  };

  const renderBody = () => {
    if (!isSupabaseConfigured) {
      return (
        <Notice
          Icon={CloudOff}
          title="Updates offline"
          body="Add your Supabase URL and key to enable updates, reactions and comments."
        />
      );
    }
    if (feedQuery.isLoading) return <UpdatesSkeleton />;
    if (feedQuery.isError && updates.length === 0) {
      return (
        <Notice
          Icon={AlertCircle}
          title="Couldn't load updates"
          body={messageOf(feedQuery.error)}
        />
      );
    }
    if (updates.length === 0) {
      return (
        <Notice
          Icon={Inbox}
          title="No updates yet"
          body="New features, boosts and fixes will show up here."
        />
      );
    }
    return updates.map((update) => (
      <PostCard
        key={update.id}
        update={update}
        tallies={summarizeReactions(reactionRows, update.id, userId)}
        onReact={(emoji) => void onReact(update, emoji)}
        onOpenComments={() => openDetailComments(update)}
        onOpen={() => openDetail(update)}
      />
    ));
  };

  return (
    // skipcq: JS-0415
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, tw`bg-background`, fadeStyle]}
    >
      <View style={tw`flex-1`} {...touchHandlers}>
        <DotPattern touchX={touchX} touchY={touchY} active={active} />
        {visible && <ShootingStars />}
        <ScrollView
          style={tw`flex-1`}
          contentContainerStyle={[
            tw`items-center px-4 pb-36`,
            { paddingTop: headerH + 32 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={feedQuery.isRefetching}
              onRefresh={() => void feedQuery.refetch()}
              tintColor="#22d3ee"
              colors={['#22d3ee']}
              progressBackgroundColor="#17324c"
              progressViewOffset={headerH + 16}
            />
          }
        >
          <View style={tw`w-full max-w-md`}>
            {error && updates.length > 0 ? (
              <Text style={tw`mb-3 px-1 font-sans text-[12px] text-red-400`}>
                {error}
              </Text>
            ) : null}
            {renderBody()}
          </View>
        </ScrollView>
        <Svg
          pointerEvents="none"
          width={screenW}
          height={headerH + cornerR}
          style={tw`absolute inset-x-0 top-0`}
        >
          <Path d={surroundPath} fill="#16203a" />
        </Svg>
        <View pointerEvents="none" style={tw`absolute inset-x-0 top-0`}>
          <Text
            style={[
              tw`font-sans-bold text-[28px] tracking-tight text-white`,
              { marginTop: insets.top + 10, marginLeft: 20 },
            ]}
          >
            Updates
          </Text>
        </View>
      </View>

      <UpdateDetailSheet
        update={detailUpdate}
        tallies={
          detailUpdate
            ? summarizeReactions(reactionRows, detailUpdate.id, userId)
            : []
        }
        authorName={AUTHOR_NAME}
        authorPic={PROFILE_PIC}
        ringColors={RING_COLORS}
        myName={myName}
        ensureUsername={ensureUsername}
        startComments={detailComments}
        onReact={(emoji) => {
          if (detailUpdate) void onReact(detailUpdate, emoji);
        }}
        onClose={() => setDetailUpdate(null)}
      />
      <UsernameSheet
        open={usernameOpen}
        onClose={onUsernameClose}
        onSaved={onUsernameSaved}
      />
    </Animated.View>
  );
}

export default memo(UpdatesScreen);
