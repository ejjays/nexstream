import { useRef } from 'react';
import { View, TextInput, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import tw from '../lib/tw';
import meow from '../../assets/meow.webp';
import LinkPing from '../components/LinkPing';
import Header from '../components/Header';
import Button3D from '../components/Button3D';
import FormatBar, { type DownloadMode } from '../components/FormatBar';
import KeyboardAwareScreen from '../components/KeyboardAwareScreen';
import { useBlurOnKeyboardHide } from '../hooks/useKeyboard';

type Props = {
  link: string;
  onChangeLink: (text: string) => void;
  loading: boolean;
  mode: DownloadMode;
  setMode: (mode: DownloadMode) => void;
  onResolve: () => void;
  onPaste: () => void;
  onInputFocus: () => void;
  refreshing: boolean;
  onRefresh: () => void;
};

export default function HomeScreen({
  link,
  onChangeLink,
  loading,
  mode,
  setMode,
  onResolve,
  onPaste,
  onInputFocus,
  refreshing,
  onRefresh,
}: Props) {
  const linkInputRef = useRef<TextInput>(null);
  useBlurOnKeyboardHide(linkInputRef);

  return (
    <KeyboardAwareScreen
      contentContainerStyle={tw`grow px-6 pb-16`}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          tintColor="#22d3ee"
          colors={['#22d3ee']}
          progressBackgroundColor="#17324c"
          progressViewOffset={16}
        />
      }
    >
      <Header />
      <View style={tw`flex-1 items-center justify-center`}>
        <View style={tw`w-full max-w-md`}>
          <View style={tw`mb-8 items-center`}>
            <Image
              source={meow}
              style={tw`h-46 w-46 md:h-52 md:w-52`}
              contentFit="contain"
            />
          </View>

          <View style={tw`relative justify-center`}>
            <View style={tw`absolute left-4 z-10`}>
              <LinkPing />
            </View>
            <TextInput
              ref={linkInputRef}
              style={[
                tw`rounded-2xl border-2 border-primary bg-black/30 pl-12 pr-4 font-mono text-[15px] text-white`,
                { height: 52, textAlignVertical: 'center' },
              ]}
              placeholder="paste your link here"
              placeholderTextColor="#5b6472"
              value={link}
              onChangeText={onChangeLink}
              onFocus={onInputFocus}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <FormatBar mode={mode} setMode={setMode} onPaste={onPaste} />

          <Button3D label="Download" loading={loading} onPress={onResolve} />
        </View>
      </View>
    </KeyboardAwareScreen>
  );
}
