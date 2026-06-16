import { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { resolve } from './src/extractors';
import { DESKTOP_UA } from './src/extractors/facebook/constants';
import { Format, VideoInfo } from './src/extractors/types';

type DownloadState = {
  status: 'downloading' | 'saved' | 'error';
  progress: number;
};

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

function safeName(name: string): string {
  return name.replace(/[^\w.-]+/gu, '_').slice(0, 50) || 'video';
}

function mimeFor(ext: string): string {
  if (ext === 'm4a') return 'audio/mp4';
  if (ext === 'jpeg' || ext === 'jpg') return 'image/jpeg';
  return 'video/mp4';
}

function refererFor(extractorKey: string): string {
  if (extractorKey === 'tiktok') return 'https://www.tiktok.com/';
  return 'https://www.facebook.com/';
}

function formatLabel(format: Format): string {
  return format.quality || format.resolution || format.formatId;
}

function cleanUrl(raw: string): string {
  return raw.trim().replace(/^['"\s]+|['"\s]+$/gu, '');
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030014',
  },

  content: {
    padding: 24,
    paddingTop: 48,
  },

  title: {
    color: '#fff',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 1,
  },

  subtitle: {
    color: '#06b6d4',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 3,
    marginTop: 4,
    marginBottom: 32,
  },

  input: {
    backgroundColor: '#0a0a1a',
    borderWidth: 1,
    borderColor: 'rgba(6,182,212,0.3)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 15,
  },

  button: {
    backgroundColor: '#06b6d4',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },

  buttonDisabled: {
    opacity: 0.4,
  },

  buttonText: {
    color: '#030014',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },

  errorBox: {
    marginTop: 20,
    backgroundColor: 'rgba(248,113,113,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.4)',
    borderRadius: 12,
    padding: 14,
  },

  error: {
    color: '#f87171',
    fontSize: 14,
  },

  errorHint: {
    color: '#7f8694',
    fontSize: 11,
    marginTop: 8,
  },

  result: {
    marginTop: 28,
  },

  resultTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },

  resultUploader: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 4,
    marginBottom: 16,
  },

  formatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0a0a1a',
    borderWidth: 1,
    borderColor: 'rgba(6,182,212,0.2)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },

  formatMeta: {
    flex: 1,
  },

  formatLabel: {
    color: '#06b6d4',
    fontSize: 15,
    fontWeight: '700',
  },

  formatSize: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 2,
  },

  dlButton: {
    backgroundColor: '#06b6d4',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    minWidth: 96,
    alignItems: 'center',
  },

  dlButtonBusy: {
    backgroundColor: '#0e7490',
  },

  dlButtonText: {
    color: '#030014',
    fontSize: 13,
    fontWeight: '900',
  },
});

export default function App() {
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});

  const setDownload = (id: string, state: DownloadState) => {
    setDownloads((prev) => ({ ...prev, [id]: state }));
  };

  const handleResolve = async () => {
    const url = cleanUrl(link);
    setLoading(true);
    setError(null);
    setInfo(null);
    setDownloads({});
    console.log(`[Resolve] ${url}`);
    try {
      const result = await resolve(url);
      if (!result) {
        setError('No video found, or this link is not supported yet.');
        return;
      }
      setInfo(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong.';
      console.error(`[Resolve] failed: ${message}`);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (format: Format) => {
    if (!info) return;
    const id = format.formatId;
    setError(null);
    setDownload(id, { status: 'downloading', progress: 0 });
    console.log(`[Download] ${info.extractorKey} ${formatLabel(format)}`);

    try {
      const ext = format.extension || 'mp4';
      const filename = `nexstream_${safeName(info.title)}_${formatLabel(format)}.${ext}`;
      const destination = new File(Paths.cache, filename);

      const file = await File.downloadFileAsync(format.url, destination, {
        idempotent: true,
        headers: {
          'User-Agent': DESKTOP_UA,
          Referer: refererFor(info.extractorKey),
        },
        onProgress: ({ bytesWritten, totalBytes }) => {
          if (totalBytes > 0) {
            const progress = Math.round((bytesWritten / totalBytes) * 100);
            setDownload(id, { status: 'downloading', progress });
          }
        },
      });

      if (!(await isAvailableAsync())) {
        throw new Error('Saving is not available on this device.');
      }

      await shareAsync(file.uri, {
        mimeType: mimeFor(ext),
        dialogTitle: 'Save your download',
      });
      setDownload(id, { status: 'saved', progress: 100 });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Download failed';
      console.error(`[Download] failed: ${message}`);
      setDownload(id, { status: 'error', progress: 0 });
      setError(`Download failed: ${message}`);
    }
  };

  const busy = loading || !link.trim();

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#030014" />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>NexStream</Text>
          <Text style={styles.subtitle}>on-device engine</Text>

          <TextInput
            style={styles.input}
            placeholder="Paste a Facebook or TikTok link"
            placeholderTextColor="#5b6472"
            value={link}
            onChangeText={setLink}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity
            style={[styles.button, busy && styles.buttonDisabled]}
            disabled={busy}
            onPress={handleResolve}
          >
            {loading ? (
              <ActivityIndicator color="#030014" />
            ) : (
              <Text style={styles.buttonText}>Resolve</Text>
            )}
          </TouchableOpacity>

          {error ? (
            <View style={styles.errorBox}>
              <Text selectable style={styles.error}>
                {error}
              </Text>
              <Text style={styles.errorHint}>long-press to copy</Text>
            </View>
          ) : null}

          {info ? (
            <View style={styles.result}>
              <Text style={styles.resultTitle}>{info.title}</Text>
              <Text style={styles.resultUploader}>{info.uploader}</Text>
              {info.formats.map((format) => {
                const dl = downloads[format.formatId];
                return (
                  <View key={format.formatId} style={styles.formatRow}>
                    <View style={styles.formatMeta}>
                      <Text style={styles.formatLabel}>
                        {formatLabel(format)}
                        {format.isMuxed ? ' · muxed' : ''}
                      </Text>
                      <Text style={styles.formatSize}>
                        {formatSize(format.filesize)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.dlButton,
                        dl?.status === 'downloading' && styles.dlButtonBusy,
                      ]}
                      disabled={dl?.status === 'downloading'}
                      onPress={() => handleDownload(format)}
                    >
                      <Text style={styles.dlButtonText}>
                        {dl?.status === 'downloading'
                          ? `${dl.progress}%`
                          : dl?.status === 'saved'
                            ? 'Done ✓'
                            : dl?.status === 'error'
                              ? 'Retry'
                              : 'Download'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
