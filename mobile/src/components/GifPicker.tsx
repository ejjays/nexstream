import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Search, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import tw from '../lib/tw';
import { tapSelection } from '../lib/haptics';
import { searchGifs, type Gif } from '../lib/social/giphy';

const GAP = 8;
const CYAN = '#22d3ee';

export default function GifPicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    setLoading(true);
    // debounce typed queries; trending (empty query) loads immediately
    const timer = setTimeout(
      () => {
        searchGifs(query, controller.signal)
          .then((results) => {
            setGifs(results);
            setLoading(false);
          })
          .catch((err: Error) => {
            if (err.name !== 'AbortError') setLoading(false);
          });
      },
      query ? 350 : 0
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const colWidth = (screenW - GAP * 3) / 2;
  const columns: Gif[][] = [[], []];
  gifs.forEach((gif, index) => columns[index % 2].push(gif));

  const pick = (url: string) => {
    tapSelection();
    onSelect(url);
    onClose();
  };

  return (
    <Modal
      visible={open}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={[tw`flex-1 bg-background`, { paddingTop: insets.top }]}
      >
        <View style={tw`flex-row items-center px-4 pb-2 pt-2`}>
          <Text style={tw`font-sans-bold text-[20px] tracking-tight text-white`}>
            GIFs
          </Text>
          <Text style={tw`ml-2 font-sans text-[11px] text-white/30`}>
            Powered by GIPHY
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={tw`ml-auto h-9 w-9 items-center justify-center rounded-full bg-white/8`}
          >
            <X size={20} color="#cbd5e1" strokeWidth={2} />
          </Pressable>
        </View>

        <View
          style={tw`mx-4 mb-2 flex-row items-center rounded-full bg-white/8 px-4 py-2.5`}
        >
          <Search size={18} color="#64748b" strokeWidth={2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search GIPHY"
            placeholderTextColor="#64748b"
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            style={tw`ml-2.5 flex-1 font-sans text-[16px] text-white`}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <X size={16} color="#64748b" strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>

        {loading && gifs.length === 0 ? (
          <View style={tw`flex-1 items-center justify-center`}>
            <ActivityIndicator color={CYAN} />
          </View>
        ) : gifs.length === 0 ? (
          <View style={tw`flex-1 items-center justify-center px-8`}>
            <Text style={tw`text-center font-sans text-[14px] text-slate-500`}>
              No GIFs found
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: GAP, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[tw`flex-row`, { gap: GAP }]}>
              {columns.map((column, colIndex) => (
                <View
                  key={colIndex === 0 ? 'left' : 'right'}
                  style={{ flex: 1, gap: GAP }}
                >
                  {column.map((gif) => (
                    <Pressable key={gif.id} onPress={() => pick(gif.url)}>
                      <Image
                        source={{ uri: gif.preview }}
                        style={{
                          width: '100%',
                          height: Math.min(
                            colWidth / gif.aspect,
                            colWidth * 2
                          ),
                          borderRadius: 12,
                          backgroundColor: 'rgba(255,255,255,0.05)',
                        }}
                        contentFit="cover"
                      />
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
