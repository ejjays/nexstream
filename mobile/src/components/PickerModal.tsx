import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useScreenSize } from '../lib/useScreenSize';
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
  SquarePen,
  Film,
} from 'lucide-react-native';
import tw from '../lib/tw';
import { VideoInfo, Format } from '../extractors/types';
import {
  DownloadState,
  DownloadMeta,
  formatSize,
  formatLabel,
} from '../lib/format';

type Props = {
  info: VideoInfo | null;
  downloads: Record<string, DownloadState>;
  preferAudio?: boolean;
  onClose: () => void;
  onDownload: (format: Format, meta?: DownloadMeta) => void;
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

function actionLabel(state?: DownloadState): string {
  if (state?.status === 'downloading') return `${state.progress}%`;
  if (state?.status === 'muxing') return 'Muxing…';
  if (state?.status === 'saved') return 'Saved ✓';
  if (state?.status === 'error') return 'Retry';
  return 'Get File';
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
}: EditFormProps) => (
  <View>
    <FieldLabel label="Title" />
    <TextInput
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
        <Text style={tw`font-mono-medium text-sm text-slate-400`}>Cancel</Text>
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

type GetFileButtonProps = {
  state?: DownloadState;
  downloading: boolean;
  isMdUp: boolean;
  onPress: () => void;
};

const GetFileButton = ({
  state,
  downloading,
  isMdUp,
  onPress,
}: GetFileButtonProps) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={downloading}
    style={tw.style(
      'flex-row items-center justify-center rounded-2xl px-5',
      downloading ? 'bg-cyan-700' : 'bg-primary'
    )}
  >
    {downloading ? null : (
      <Download size={20} color="#ffffff" strokeWidth={2.5} />
    )}
    {!downloading && !isMdUp ? null : (
      <Text
        style={tw.style(
          'font-mono-bold text-xs uppercase tracking-wider text-white',
          downloading ? '' : 'ml-2'
        )}
      >
        {actionLabel(state)}
      </Text>
    )}
  </TouchableOpacity>
);

type ContentProps = {
  info: VideoInfo;
  downloads: Record<string, DownloadState>;
  preferAudio: boolean;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  onClose: () => void;
  onDownload: (format: Format, meta?: DownloadMeta) => void;
};

// skipcq: JS-R1005
function PickerContent({
  info,
  downloads,
  preferAudio,
  open,
  setOpen,
  onClose,
  onDownload,
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
  const { width } = useScreenSize();
  const isMdUp = width >= 768;

  const selected =
    info.formats.find((format) => format.formatId === selectedId) ??
    info.formats[0] ??
    null;
  const selectedBadge = selected ? badgeFor(selected) : null;
  const state = selected ? downloads[selected.formatId] : undefined;
  const downloading =
    state?.status === 'downloading' || state?.status === 'muxing';
  const isAudio = selected ? selected.isAudio && !selected.isVideo : false;
  const progress = state?.progress ?? 0;

  const handleGet = () => {
    if (!selected) return;
    onDownload(selected, { title: title.trim() || info.title });
  };

  return (
    <Pressable
      onPress={() => setOpen(false)}
      style={[
        tw`w-full max-w-lg overflow-hidden rounded-3xl border border-primary/30 bg-[#0f172a]`,
        { maxHeight: '90%' },
        glowShadow,
      ]}
    >
      <View style={[tw`relative w-full bg-black`, { aspectRatio: 16 / 9 }]}>
        {info.thumbnail ? (
          <Image
            source={{ uri: info.thumbnail }}
            style={tw`h-full w-full`}
            contentFit="cover"
          />
        ) : null}
        <LinearGradient
          colors={['transparent', 'rgba(15,23,42,0.95)'] as const}
          style={tw`absolute inset-0`}
          pointerEvents="none"
        />
        <View style={tw`absolute inset-0 items-center justify-center`}>
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
        <TouchableOpacity
          onPress={onClose}
          style={tw`absolute right-3 top-3 h-8 w-8 items-center justify-center rounded-full bg-black/50`}
        >
          <X size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={tw`p-5`}>
        {editing ? (
          <EditForm
            title={title}
            author={author}
            setTitle={setTitle}
            setAuthor={setAuthor}
            onCancel={() => {
              setTitle(info.title);
              setAuthor(info.uploader);
              setEditing(false);
            }}
            onSave={() => setEditing(false)}
          />
        ) : (
          // skipcq: JS-0415
          <View>
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
                    <Film size={13} color="#94a3b8" />
                  )}
                  <Text style={tw`ml-1.5 font-mono text-[10px] text-slate-500`}>
                    Format:{' '}
                    <Text style={tw`font-mono-bold text-slate-300`}>
                      {selected ? extLabel(selected) : 'MP4'}
                    </Text>
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setEditing(true)}
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

                  <GetFileButton
                    state={state}
                    downloading={downloading}
                    isMdUp={isMdUp}
                    onPress={handleGet}
                  />
                </View>

                {downloading ? (
                  <View
                    style={tw`mt-3 h-1 overflow-hidden rounded-full bg-white/10`}
                  >
                    <View
                      style={[
                        tw`h-full rounded-full bg-primary`,
                        { width: `${progress}%` as DimensionValue },
                      ]}
                    />
                  </View>
                ) : null}
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
      </View>

      {!editing && selected ? (
        <View style={tw`border-t border-white/5 bg-black/20 px-4 py-3`}>
          <Text
            style={tw`text-center font-mono text-[10px] leading-tight text-slate-500`}
          >
            {formatSize(selected.filesize)} · {extLabel(selected)}
            {selected.isMuxed ? ' · video + audio in one file' : ''}
          </Text>
        </View>
      ) : null}
    </Pressable>
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

  const closeAll = () => {
    setDropdownOpen(false);
    onClose();
  };

  return (
    <Modal
      visible={Boolean(info)}
      transparent
      animationType="fade"
      onRequestClose={closeAll}
    >
      <Pressable
        style={tw`flex-1 items-center justify-center bg-black/70 px-4`}
        onPress={() => setDropdownOpen(false)}
      >
        {info ? (
          <PickerContent
            key={`${info.id}:${info.formats.length > 0 ? 'full' : 'partial'}`}
            info={info}
            downloads={downloads}
            preferAudio={preferAudio}
            open={dropdownOpen}
            setOpen={setDropdownOpen}
            onClose={closeAll}
            onDownload={onDownload}
          />
        ) : null}
      </Pressable>
    </Modal>
  );
}
