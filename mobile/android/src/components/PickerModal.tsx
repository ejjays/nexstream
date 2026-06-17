import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import type { DimensionValue } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  X,
  Play,
  Music,
  ChevronDown,
  Check,
  Download,
  Pencil,
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

const Badge = ({ label }: { label: string }) => (
  <View style={tw`ml-2 rounded-md bg-primary/20 px-1.5 py-0.5`}>
    <Text style={tw`font-mono-bold text-[9px] uppercase tracking-tight text-primary`}>
      {label}
    </Text>
  </View>
);

type QualityOptionProps = {
  format: Format;
  selected: boolean;
  onSelect: () => void;
};

const QualityOption = ({ format, selected, onSelect }: QualityOptionProps) => (
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
          {qualityText(format)}
        </Text>
        {format.isMuxed ? <Badge label="muxed" /> : null}
        {format.isAudio && !format.isVideo ? <Badge label="audio" /> : null}
      </View>
      <Text
        style={tw.style(
          'mt-0.5 font-mono text-[10px]',
          selected ? 'text-primary/70' : 'text-primary/40'
        )}
      >
        {formatSize(format.filesize)} · {extLabel(format)}
      </Text>
    </View>
    {selected ? (
      <View style={tw`rounded-full bg-primary/20 p-1`}>
        <Check size={12} color="#22d3ee" strokeWidth={4} />
      </View>
    ) : null}
  </TouchableOpacity>
);

type EditFormProps = {
  title: string;
  author: string;
  setTitle: (value: string) => void;
  setAuthor: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

const FieldLabel = ({ label }: { label: string }) => (
  <Text style={tw`ml-1 font-mono-bold text-[10px] uppercase tracking-wider text-primary`}>
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
      style={tw`mt-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-sm text-white`}
    />
    <View style={tw`mt-3`}>
      <FieldLabel label="Author" />
      <TextInput
        value={author}
        onChangeText={setAuthor}
        placeholder="Enter author"
        placeholderTextColor="#5b6472"
        style={tw`mt-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-sm text-white`}
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
        <Text style={tw`ml-1 font-mono-bold text-sm text-background`}>Save</Text>
      </TouchableOpacity>
    </View>
  </View>
);

type ContentProps = {
  info: VideoInfo;
  downloads: Record<string, DownloadState>;
  onClose: () => void;
  onDownload: (format: Format, meta?: DownloadMeta) => void;
};

// skipcq: JS-R1005
function PickerContent({ info, downloads, onClose, onDownload }: ContentProps) {
  const [selectedId, setSelectedId] = useState(
    () => info.formats[0]?.formatId ?? ''
  );
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(info.title);
  const [author, setAuthor] = useState(info.uploader);

  const selected =
    info.formats.find((format) => format.formatId === selectedId) ??
    info.formats[0] ??
    null;
  const state = selected ? downloads[selected.formatId] : undefined;
  const downloading = state?.status === 'downloading' || state?.status === 'muxing';
  const isAudio = selected ? selected.isAudio && !selected.isVideo : false;
  const progress = state?.progress ?? 0;

  const handleGet = () => {
    if (!selected) return;
    onDownload(selected, { title: title.trim() || info.title });
  };

  return (
    <Pressable
      onPress={() => undefined}
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
              <Music size={28} color="#22d3ee" />
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
                  style={tw`ml-3 h-7 w-7 items-center justify-center rounded-md border border-primary/60 bg-white/5`}
                >
                  <Pencil size={15} color="#22d3ee" />
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
                        <View style={tw`border-b border-white/5 bg-white/5 px-4 py-3`}>
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
                        <Text
                          style={tw`font-mono-bold text-[15px] text-white`}
                          numberOfLines={1}
                        >
                          {qualityText(selected)}
                        </Text>
                        <Text style={tw`mt-0.5 font-mono text-[11px] text-primary/60`}>
                          {formatSize(selected.filesize)} · {extLabel(selected)}
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

                  <TouchableOpacity
                    onPress={handleGet}
                    disabled={downloading}
                    style={tw.style(
                      'flex-row items-center justify-center rounded-2xl px-5',
                      downloading ? 'bg-cyan-700' : 'bg-primary'
                    )}
                  >
                    {downloading ? null : (
                      <Download size={20} color="#030014" strokeWidth={2.5} />
                    )}
                    <Text
                      style={tw.style(
                        'font-mono-bold text-xs uppercase tracking-wider text-background',
                        downloading ? '' : 'ml-2'
                      )}
                    >
                      {actionLabel(state)}
                    </Text>
                  </TouchableOpacity>
                </View>

                {downloading ? (
                  <View style={tw`mt-3 h-1 overflow-hidden rounded-full bg-white/10`}>
                    <View
                      style={[
                        tw`h-full rounded-full bg-primary`,
                        { width: `${progress}%` as DimensionValue },
                      ]}
                    />
                  </View>
                ) : null}
              </View>
            ) : (
              <View
                style={tw`mt-5 rounded-2xl border border-dashed border-white/10 px-4 py-5`}
              >
                <Text style={tw`text-center font-mono text-[12px] italic text-slate-500`}>
                  No formats found.
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {!editing && selected ? (
        <View style={tw`border-t border-white/5 bg-black/20 px-4 py-3`}>
          <Text style={tw`text-center font-mono text-[10px] leading-tight text-slate-500`}>
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
  onClose,
  onDownload,
}: Props) {
  return (
    <Modal
      visible={Boolean(info)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={tw`flex-1 items-center justify-center bg-black/70 px-4`}
        onPress={onClose}
      >
        {info ? (
          <PickerContent
            key={info.id}
            info={info}
            downloads={downloads}
            onClose={onClose}
            onDownload={onDownload}
          />
        ) : null}
      </Pressable>
    </Modal>
  );
}
