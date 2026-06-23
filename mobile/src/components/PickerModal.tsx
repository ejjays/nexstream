import {
  useState,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  Keyboard,
} from 'react-native';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useScreenSize } from '../hooks/useScreenSize';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import {
  X,
  Play,
  Music,
  ListMusic,
  ChevronDown,
  Check,
  Download,
  RotateCcw,
  SquarePen,
  FilePlay,
} from 'lucide-react-native';
import tw from '../lib/tw';
import { openGallery } from '../lib/gallery';
import logo from '../../assets/meow.webp';
import { VideoInfo, Format } from '../extractors/types';
import VideoPreviewModal from './VideoPreviewModal';
import {
  DownloadState,
  DownloadMeta,
  formatSize,
  formatLabel,
  previewableFormat,
} from '../lib/format';

type Props = {
  info: VideoInfo | null;
  downloads: Record<string, DownloadState>;
  preferAudio?: boolean;
  onClose: () => void;
  onDownload: (format: Format, meta?: DownloadMeta) => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/* lift focused field above keyboard */
const computeLift = (
  fieldBottom: number,
  keyboardHeight: number,
  screenH: number
): number => {
  if (keyboardHeight <= 0 || fieldBottom <= 0) return 0;
  const needed = fieldBottom + 24 - (screenH - keyboardHeight);
  return needed > 0 ? -needed : 0;
};

const glowShadow = {
  shadowColor: '#06b6d4',
  shadowOpacity: 0.25,
  shadowRadius: 40,
  shadowOffset: { width: 0, height: 0 },
  elevation: 20,
};

const panelShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.6,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 16 },
  elevation: 24,
};

function qualityText(format: Format): string {
  const raw = format.quality || format.resolution || '';
  if (raw.includes('4320')) return '8K';
  if (raw.includes('2160')) return '4K';
  if (raw.includes('1440')) return '2K';
  return formatLabel(format);
}

function extLabel(format: Format): string {
  return (format.extension || 'RAW').toUpperCase();
}

function SkeletonBar({ style }: { style: StyleProp<ViewStyle> }) {
  const [barWidth, setBarWidth] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.linear }),
      -1,
      false
    );
  }, [progress]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(progress.value, [0, 1], [-barWidth, barWidth]),
      },
    ],
  }));

  return (
    <View
      onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
      style={[style, { overflow: 'hidden' }]}
    >
      {barWidth > 0 ? (
        <Animated.View
          style={[
            { position: 'absolute', top: 0, bottom: 0, width: barWidth },
            shimmerStyle,
          ]}
        >
          <LinearGradient
            colors={
              ['transparent', 'rgba(255,255,255,0.16)', 'transparent'] as const
            }
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={tw`flex-1`}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

type BadgeInfo = { label: string; tone: 'cyan' | 'amber' };

function isAudioOnly(format: Format): boolean {
  return format.isAudio && !format.isVideo;
}

function titleFor(format: Format): string {
  return isAudioOnly(format) ? extLabel(format) : qualityText(format);
}

function subtitleFor(format: Format): string {
  const size = formatSize(format.filesize);
  if (isAudioOnly(format)) {
    const tag = format.extension === 'mp3' ? 'Converted' : 'Original';
    return size ? `${tag} · ${size}` : tag;
  }
  return size ? `${size} · ${extLabel(format)}` : extLabel(format);
}

function badgeFor(format: Format): BadgeInfo | null {
  if (isAudioOnly(format)) {
    return format.extension === 'mp3'
      ? { label: 'HIGH', tone: 'cyan' }
      : { label: 'MAX', tone: 'amber' };
  }
  if (format.isMuxed) return { label: 'muxed', tone: 'cyan' };
  return null;
}

const Badge = ({
  label,
  tone = 'cyan',
}: {
  label: string;
  tone?: 'cyan' | 'amber';
}) => (
  <View
    style={tw.style(
      'ml-2.5 rounded-md px-1.5 py-0.5',
      tone === 'amber' ? 'bg-amber-500/20' : 'bg-primary/20'
    )}
  >
    <Text
      style={tw.style(
        'font-mono-bold text-[9px] uppercase tracking-tight',
        tone === 'amber' ? 'text-amber-300' : 'text-primary'
      )}
    >
      {label}
    </Text>
  </View>
);

type QualityOptionProps = {
  format: Format;
  selected: boolean;
  onSelect: () => void;
};

const QualityOption = ({ format, selected, onSelect }: QualityOptionProps) => {
  const badge = badgeFor(format);
  return (
    <TouchableOpacity
      onPress={onSelect}
      style={tw.style(
        'flex-row items-center justify-between border-l-2 px-4 py-3',
        selected ? 'border-primary bg-primary/10' : 'border-transparent'
      )}
    >
      <View style={tw`flex-1`}>
        <View style={tw`flex-row items-center`}>
          <Text
            style={tw.style(
              'font-mono-bold text-sm',
              selected ? 'text-primary' : 'text-slate-200'
            )}
          >
            {titleFor(format)}
          </Text>
          {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
        </View>
        <Text
          style={tw.style(
            'mt-0.5 font-mono text-[10px]',
            selected ? 'text-primary/70' : 'text-primary/40'
          )}
        >
          {subtitleFor(format)}
        </Text>
      </View>
      {selected ? (
        <View style={tw`rounded-full bg-primary/20 p-1`}>
          <Check size={12} color="#22d3ee" strokeWidth={4} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

type EditFormProps = {
  title: string;
  author: string;
  setTitle: (value: string) => void;
  setAuthor: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  onFocusField: (bottomY: number) => void;
};

const FieldLabel = ({ label }: { label: string }) => (
  <Text
    style={tw`ml-1 font-mono-bold text-[10px] uppercase tracking-wider text-primary`}
  >
    {label}
  </Text>
);

const EditForm = ({
  title,
  author,
  setTitle,
  setAuthor,
  onCancel,
  onSave,
  onFocusField,
}: EditFormProps) => {
  const titleRef = useRef<TextInput>(null);
  const authorRef = useRef<TextInput>(null);
  return (
    <View>
      <FieldLabel label="Title" />
      <TextInput
        ref={titleRef}
        onFocus={() =>
          titleRef.current?.measureInWindow((_x, y, _w, height) =>
            onFocusField(y + height)
          )
        }
        value={title}
        onChangeText={setTitle}
        placeholder="Enter title"
        placeholderTextColor="#5b6472"
        style={[
          tw`mt-1 rounded-xl border border-white/10 bg-black/20 px-4 font-mono text-sm text-white`,
          { height: 48, textAlignVertical: 'center' },
        ]}
      />
      <View style={tw`mt-3`}>
        <FieldLabel label="Author" />
        <TextInput
          ref={authorRef}
          onFocus={() =>
            authorRef.current?.measureInWindow((_x, y, _w, height) =>
              onFocusField(y + height)
            )
          }
          value={author}
          onChangeText={setAuthor}
          placeholder="Enter author"
          placeholderTextColor="#5b6472"
          style={[
            tw`mt-1 rounded-xl border border-white/10 bg-black/20 px-4 font-mono text-sm text-white`,
            { height: 48, textAlignVertical: 'center' },
          ]}
        />
      </View>
      <View style={tw`mt-5 flex-row justify-between`}>
        <TouchableOpacity
          onPress={onCancel}
          style={tw`mr-1.5 flex-1 items-center rounded-xl border border-white/10 py-3`}
        >
          <Text style={tw`font-mono-medium text-sm text-slate-400`}>
            Cancel
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSave}
          style={tw`ml-1.5 flex-1 flex-row items-center justify-center rounded-xl bg-primary py-3`}
        >
          <Check size={16} color="#030014" strokeWidth={4} />
          <Text style={tw`ml-1 font-mono-bold text-sm text-background`}>
            Save
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

type GetFileButtonProps = {
  state?: DownloadState;
  onPress: () => void;
};

const GetFileButton = ({ state, onPress }: GetFileButtonProps) => {
  const status = state?.status;
  const active = status === 'downloading' || status === 'muxing';
  const errored = status === 'error';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={active}
      activeOpacity={0.85}
      style={tw.style(
        'w-16 items-center justify-center rounded-2xl',
        errored ? 'bg-amber-500' : 'bg-primary',
        active ? 'opacity-40' : ''
      )}
    >
      {errored ? (
        <RotateCcw size={22} color="#231400" strokeWidth={2.5} />
      ) : (
        <Download size={22} color="#ffffff" strokeWidth={2.5} />
      )}
    </TouchableOpacity>
  );
};

const SHIMMER_BAND = 64;

function FooterProgress({ state }: { state: DownloadState }) {
  const muxing = state.status === 'muxing';
  const fill = useSharedValue(0);
  const shimmer = useSharedValue(0);
  const lastT = useRef(Date.now());
  const [trackW, setTrackW] = useState(0);

  useEffect(() => {
    const now = Date.now();
    // glide at the real download rate
    const dt = Math.min(Math.max(now - lastT.current, 180), 1200);
    lastT.current = now;
    fill.value = withTiming(muxing ? 1 : state.progress / 100, {
      duration: dt,
      easing: Easing.linear,
    });
  }, [state.progress, muxing, fill]);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
  }, [shimmer]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fill.value * 100}%` as DimensionValue,
  }));
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          shimmer.value,
          [0, 1],
          [-SHIMMER_BAND, trackW + SHIMMER_BAND]
        ),
      },
    ],
  }));

  return (
    <View style={tw`w-full`}>
      <View style={tw`mb-2 flex-row items-center justify-between`}>
        <Text
          style={tw`font-mono text-[10px] uppercase tracking-[2px] text-primary`}
        >
          {muxing ? 'Finishing up…' : 'Downloading'}
        </Text>
        {muxing ? null : (
          <Text style={tw`font-mono-bold text-[11px] text-white`}>
            {state.progress}
            <Text style={tw`text-primary`}>%</Text>
          </Text>
        )}
      </View>
      <View
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
        style={tw`h-2 overflow-hidden rounded-full bg-white/10`}
      >
        <Animated.View
          style={[tw`h-full overflow-hidden rounded-full`, fillStyle]}
        >
          <LinearGradient
            colors={['#22d3ee', '#6366f1']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={tw`h-full w-full`}
          />
          {trackW > 0 ? (
            <Animated.View
              style={[
                tw`absolute inset-y-0`,
                { width: SHIMMER_BAND },
                shimmerStyle,
              ]}
            >
              <LinearGradient
                colors={[
                  'rgba(255,255,255,0)',
                  'rgba(255,255,255,0.35)',
                  'rgba(255,255,255,0)',
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={tw`h-full w-full`}
              />
            </Animated.View>
          ) : null}
        </Animated.View>
      </View>
    </View>
  );
}

function PickerFooter({
  selected,
  editing,
  state,
}: {
  selected: Format;
  editing: boolean;
  state?: DownloadState;
}) {
  const status = state?.status;
  const downloading = status === 'downloading' || status === 'muxing';

  return (
    <View
      style={tw`h-14 justify-center border-t border-white/5 bg-black/20 px-4`}
    >
      {downloading && state ? (
        <FooterProgress state={state} />
      ) : (
        <Text
          style={tw.style(
            'text-center font-mono text-[10px] leading-tight',
            status === 'error' ? 'text-red-400' : 'text-slate-500'
          )}
        >
          {status === 'error'
            ? 'Download failed — tap retry'
            : editing
              ? 'Changes will update file info when you download.'
              : `${formatSize(selected.filesize)} · ${extLabel(selected)}${
                  selected.isMuxed ? ' · video + audio in one file' : ''
                }`}
        </Text>
      )}
    </View>
  );
}

function DownloadSuccess({
  onClose,
  onOpenGallery,
}: {
  onClose: () => void;
  onOpenGallery: () => void;
}) {
  const enter = useSharedValue(0);

  useEffect(() => {
    enter.value = withTiming(1, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    });
  }, [enter]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: interpolate(enter.value, [0, 1], [12, 0]) }],
  }));

  return (
    <Animated.View
      style={[tw`absolute inset-0 overflow-hidden bg-[#0b1626]`, overlayStyle]}
    >
      <LinearGradient
        colors={['rgba(34,211,238,0.16)', 'rgba(34,211,238,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={tw`absolute inset-x-0 top-0 h-44`}
      />
      <View style={tw`flex-1 items-center justify-center px-6`}>
        <View
          style={[
            tw`h-28 w-28 items-center justify-center rounded-full border border-primary/40 bg-primary/10`,
            glowShadow,
          ]}
        >
          <Image source={logo} style={tw`h-16 w-16`} contentFit="contain" />
        </View>
        <Text style={tw`mt-7 font-sans-bold text-[22px] text-white`}>
          Download complete
        </Text>
        <Text style={tw`mt-2 font-sans text-[13px] text-cyan-300/80`}>
          Saved to your gallery
        </Text>
      </View>
      <View style={tw`px-6 pb-7`}>
        <TouchableOpacity onPress={onClose} activeOpacity={0.85}>
          <LinearGradient
            colors={['#22d3ee', '#0891b2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[tw`items-center rounded-2xl py-3.5`, glowShadow]}
          >
            <Text style={tw`font-sans-bold text-[15px] text-[#04222c]`}>
              Done
            </Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onOpenGallery}
          activeOpacity={0.8}
          style={tw`mt-2.5 items-center rounded-2xl border border-primary/30 bg-primary/5 py-3.5`}
        >
          <Text style={tw`font-sans-semibold text-[14px] text-primary`}>
            Open gallery
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const ThumbOverlay = ({ isAudio }: { isAudio: boolean }) => (
  <View
    style={tw`absolute inset-0 items-center justify-center`}
    pointerEvents="none"
  >
    <View
      style={tw`h-16 w-16 items-center justify-center rounded-full border border-primary/30 bg-primary/20`}
    >
      {isAudio ? (
        <ListMusic size={28} color="#22d3ee" />
      ) : (
        <Play size={30} color="#22d3ee" />
      )}
    </View>
  </View>
);

type ContentProps = {
  info: VideoInfo;
  downloads: Record<string, DownloadState>;
  preferAudio: boolean;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  zoomed: boolean;
  setZoomed: Dispatch<SetStateAction<boolean>>;
  onClose: () => void;
  onDownload: (format: Format, meta?: DownloadMeta) => void;
  onPreview: (url: string, aspectRatio: number) => void;
};

// skipcq: JS-R1005
function PickerContent({
  info,
  downloads,
  preferAudio,
  open,
  setOpen,
  zoomed,
  setZoomed,
  onClose,
  onDownload,
  onPreview,
}: ContentProps) {
  const [selectedId, setSelectedId] = useState(() => {
    const preferred = preferAudio
      ? info.formats.find((format) => format.isAudio && !format.isVideo)
      : info.formats.find((format) => format.isVideo);
    return (preferred ?? info.formats[0])?.formatId ?? '';
  });
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(info.title);
  const [author, setAuthor] = useState(info.uploader);
  const { height: screenH } = useScreenSize();

  const kbHeight = useRef(0);
  const fieldBottom = useRef(0);
  const lift = useSharedValue(0);

  const onFocusField = (windowBottom: number) => {
    fieldBottom.current = windowBottom - lift.value;
    lift.value = withTiming(
      computeLift(fieldBottom.current, kbHeight.current, screenH),
      { duration: 220 }
    );
  };

  useEffect(() => {
    const onShow = (event: { endCoordinates: { height: number } }) => {
      kbHeight.current = event.endCoordinates.height;
      lift.value = withTiming(
        computeLift(fieldBottom.current, kbHeight.current, screenH),
        { duration: 220 }
      );
    };
    const onHide = () => {
      kbHeight.current = 0;
      lift.value = withTiming(0, { duration: 220 });
    };
    const showSub = Keyboard.addListener('keyboardDidShow', onShow);
    const hideSub = Keyboard.addListener('keyboardDidHide', onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [screenH, lift]);

  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value }],
  }));

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(zoomed ? 1.1 : 1, { duration: 700 }) }],
  }));

  const editOpacity = useSharedValue(1);
  const editTx = useSharedValue(0);
  const transitioning = useRef(false);
  const viewHeight = useRef(0);

  const editAnimStyle = useAnimatedStyle(() => ({
    opacity: editOpacity.value,
    transform: [{ translateX: editTx.value }],
  }));

  /* mode="wait": exit current, swap, then enter */
  const startEditTransition = (next: boolean, onSwap?: () => void) => {
    if (transitioning.current || editing === next) return;
    transitioning.current = true;
    const dist = next ? 20 : -20;
    editOpacity.value = withTiming(0, {
      duration: 160,
      easing: Easing.in(Easing.quad),
    });
    editTx.value = withTiming(dist, {
      duration: 160,
      easing: Easing.in(Easing.quad),
    });
    setTimeout(() => {
      onSwap?.();
      setEditing(next);
      editTx.value = dist;
      editOpacity.value = withTiming(1, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
      editTx.value = withTiming(0, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
      setTimeout(() => {
        transitioning.current = false;
      }, 220);
    }, 160);
  };

  const selected =
    info.formats.find((format) => format.formatId === selectedId) ??
    info.formats[0] ??
    null;
  const selectedBadge = selected ? badgeFor(selected) : null;
  const state = selected ? downloads[selected.formatId] : undefined;
  const isAudio = selected ? selected.isAudio && !selected.isVideo : false;

  const handleGet = () => {
    if (!selected) return;
    onDownload(selected, { title: title.trim() || info.title });
  };

  const previewFormat = previewableFormat(info.formats, selected, isAudio);
  const canPreview = previewFormat !== null;
  const handlePreview = () => {
    if (!previewFormat) return;
    const ratio =
      previewFormat.width && previewFormat.height
        ? previewFormat.width / previewFormat.height
        : 16 / 9;
    onPreview(previewFormat.url, ratio);
  };

  return (
    <AnimatedPressable
      onPress={() => {
        setOpen(false);
        setZoomed(false);
      }}
      style={[
        tw`w-full max-w-lg overflow-hidden rounded-3xl border border-primary/30 bg-[#0f172a]`,
        { maxHeight: '90%' },
        glowShadow,
        liftStyle,
      ]}
    >
      <Pressable
        onPress={() => {
          if (canPreview) handlePreview();
          else setZoomed(true);
        }}
        style={[
          tw`relative w-full overflow-hidden bg-black`,
          { aspectRatio: 16 / 9 },
        ]}
      >
        {info.thumbnail ? (
          <Animated.View style={[tw`h-full w-full`, zoomStyle]}>
            <Image
              source={{ uri: info.thumbnail }}
              style={tw`h-full w-full`}
              contentFit="cover"
            />
          </Animated.View>
        ) : null}
        <LinearGradient
          colors={
            [
              'rgba(15,23,42,0)',
              'rgba(15,23,42,0)',
              '#0f172a',
              '#0f172a',
            ] as const
          }
          locations={[0, 0.6, 0.96, 1] as const}
          style={tw`absolute inset-0`}
          pointerEvents="none"
        />
        <ThumbOverlay isAudio={isAudio} />
        <TouchableOpacity
          onPress={onClose}
          style={tw`absolute right-3 top-3 h-8 w-8 items-center justify-center rounded-full bg-black/50`}
        >
          <X size={18} color="#fff" />
        </TouchableOpacity>
      </Pressable>

      <View style={tw`px-5 pb-5 pt-0.5`}>
        <Animated.View style={editAnimStyle}>
          {editing ? (
            <View
              style={[
                tw`justify-center`,
                viewHeight.current ? { minHeight: viewHeight.current } : null,
              ]}
            >
              <EditForm
                title={title}
                author={author}
                setTitle={setTitle}
                setAuthor={setAuthor}
                onCancel={() =>
                  startEditTransition(false, () => {
                    setTitle(info.title);
                    setAuthor(info.uploader);
                  })
                }
                onSave={() => startEditTransition(false)}
                onFocusField={onFocusField}
              />
            </View>
          ) : (
            // skipcq: JS-0415
            <View
              onLayout={(event) => {
                viewHeight.current = event.nativeEvent.layout.height;
              }}
            >
              <View>
                <Text
                  style={tw`font-mono-bold text-lg text-white`}
                  numberOfLines={2}
                >
                  {title}
                </Text>
                <Text
                  style={tw`mt-1 font-mono-medium text-xs text-slate-400`}
                  numberOfLines={1}
                >
                  {author || 'Unknown Author'}
                </Text>
                <View style={tw`mt-2 flex-row items-center`}>
                  <View style={tw`flex-row items-center`}>
                    {isAudio ? (
                      <Music size={13} color="#22d3ee" />
                    ) : (
                      <FilePlay size={13} color="#94a3b8" />
                    )}
                    <Text
                      style={tw`ml-1.5 font-mono text-[10px] text-slate-500`}
                    >
                      Format:{' '}
                      <Text style={tw`font-mono-bold text-slate-300`}>
                        {selected ? extLabel(selected) : 'MP4'}
                      </Text>
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => startEditTransition(true)}
                    style={tw`ml-1 p-1`}
                  >
                    <SquarePen size={18} color="#22d3ee" />
                  </TouchableOpacity>
                </View>
              </View>

              {selected ? (
                // skipcq: JS-0415
                <View style={tw`mt-5`}>
                  <Text
                    style={tw`ml-1 font-mono-bold text-[10px] uppercase tracking-wider text-primary/80`}
                  >
                    Select Output Quality
                  </Text>
                  <View style={tw`mt-2 flex-row items-stretch`}>
                    <View style={tw`relative mr-2.5 flex-1`}>
                      {open ? (
                        <View
                          style={[
                            tw`absolute overflow-hidden rounded-3xl border border-primary/20 bg-slate-950`,
                            {
                              left: 0,
                              right: 0,
                              bottom: '100%',
                              marginBottom: 12,
                              zIndex: 50,
                            },
                            panelShadow,
                          ]}
                        >
                          <View
                            style={tw`border-b border-white/5 bg-white/5 px-4 py-3`}
                          >
                            <Text
                              style={tw`font-mono-bold text-[9px] uppercase tracking-[2px] text-primary`}
                            >
                              Available Streams
                            </Text>
                          </View>
                          <ScrollView
                            style={{ maxHeight: 176 }}
                            nestedScrollEnabled
                            contentContainerStyle={tw`py-1`}
                            keyboardShouldPersistTaps="handled"
                          >
                            {info.formats.map((format) => (
                              <QualityOption
                                key={format.formatId}
                                format={format}
                                selected={format.formatId === selected.formatId}
                                onSelect={() => {
                                  setSelectedId(format.formatId);
                                  setOpen(false);
                                }}
                              />
                            ))}
                          </ScrollView>
                        </View>
                      ) : null}

                      <TouchableOpacity
                        onPress={() => setOpen((value) => !value)}
                        style={tw.style(
                          'flex-row items-center justify-between rounded-2xl border bg-white/5 px-4 py-3',
                          open ? 'border-primary/50' : 'border-white/10'
                        )}
                      >
                        <View style={tw`flex-1`}>
                          <View style={tw`flex-row items-center`}>
                            <Text
                              style={tw`font-mono-bold text-[15px] text-white`}
                              numberOfLines={1}
                            >
                              {titleFor(selected)}
                            </Text>
                            {selectedBadge ? (
                              <Badge
                                label={selectedBadge.label}
                                tone={selectedBadge.tone}
                              />
                            ) : null}
                          </View>
                          <Text
                            style={tw`mt-0.5 font-mono text-[11px] text-primary/60`}
                          >
                            {subtitleFor(selected)}
                          </Text>
                        </View>
                        <View style={tw.style('ml-2', open && 'rotate-180')}>
                          <ChevronDown
                            size={20}
                            color={open ? '#22d3ee' : '#94a3b8'}
                          />
                        </View>
                      </TouchableOpacity>
                    </View>

                    <GetFileButton state={state} onPress={handleGet} />
                  </View>
                </View>
              ) : info.isPartial ? (
                // skipcq: JS-0415
                <View style={tw`mt-5`}>
                  <Text
                    style={tw`ml-1 font-mono-bold text-[10px] uppercase tracking-wider text-primary/80`}
                  >
                    Select Output Quality
                  </Text>
                  <View style={tw`mt-2 flex-row items-stretch`}>
                    <View
                      style={tw`mr-2.5 flex-1 flex-row items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3`}
                    >
                      <View style={tw`flex-1`}>
                        <SkeletonBar
                          style={tw`h-3.5 w-3/5 rounded-md bg-white/10`}
                        />
                        <SkeletonBar
                          style={tw`mt-1.5 h-2.5 w-2/5 rounded-md bg-white/5`}
                        />
                      </View>
                      <ChevronDown size={20} color="#475569" />
                    </View>
                    <View
                      style={tw`items-center justify-center rounded-2xl bg-primary/40 px-5`}
                    >
                      <Download size={20} color="#0a3540" strokeWidth={2.5} />
                    </View>
                  </View>
                  <Text
                    style={tw`mt-3 text-center font-mono text-[10px] italic text-primary/50`}
                  >
                    Identifying available streams…
                  </Text>
                </View>
              ) : (
                <View
                  style={tw`mt-5 rounded-2xl border border-dashed border-white/10 px-4 py-5`}
                >
                  <Text
                    style={tw`text-center font-mono text-[12px] italic text-slate-500`}
                  >
                    No formats found.
                  </Text>
                </View>
              )}
            </View>
          )}
        </Animated.View>
      </View>

      {selected ? (
        <PickerFooter selected={selected} editing={editing} state={state} />
      ) : null}
      {state?.status === 'saved' ? (
        <DownloadSuccess
          onClose={onClose}
          onOpenGallery={() => {
            openGallery();
            onClose();
          }}
        />
      ) : null}
    </AnimatedPressable>
  );
}

export default function PickerModal({
  info,
  downloads,
  preferAudio = false,
  onClose,
  onDownload,
}: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [preview, setPreview] = useState<{
    url: string;
    aspectRatio: number;
  } | null>(null);

  const closeAll = () => {
    setDropdownOpen(false);
    setZoomed(false);
    setPreview(null);
    onClose();
  };

  return (
    <>
      <Modal
        visible={Boolean(info)}
        transparent
        animationType="fade"
        onRequestClose={closeAll}
      >
        <Pressable
          style={tw`flex-1 items-center justify-center bg-black/70 px-4`}
          onPress={() => {
            setDropdownOpen(false);
            setZoomed(false);
          }}
        >
          {info ? (
            <PickerContent
              key={`${info.id}:${info.formats.length > 0 ? 'full' : 'partial'}`}
              info={info}
              downloads={downloads}
              preferAudio={preferAudio}
              open={dropdownOpen}
              setOpen={setDropdownOpen}
              zoomed={zoomed}
              setZoomed={setZoomed}
              onClose={closeAll}
              onDownload={onDownload}
              onPreview={(url, aspectRatio) => setPreview({ url, aspectRatio })}
            />
          ) : null}
        </Pressable>
      </Modal>
      <VideoPreviewModal
        visible={Boolean(preview)}
        url={preview?.url ?? null}
        aspectRatio={preview?.aspectRatio ?? 16 / 9}
        poster={info?.thumbnail}
        onClose={() => setPreview(null)}
      />
    </>
  );
}
