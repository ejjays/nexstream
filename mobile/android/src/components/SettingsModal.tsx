import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { X, Check, Settings as SettingsIcon } from 'lucide-react-native';
import tw from '../lib/tw';
import { getBilibiliCookie, setBilibiliCookie } from '../lib/settings';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const panelShadow = {
  shadowColor: '#06b6d4',
  shadowOpacity: 0.25,
  shadowRadius: 40,
  shadowOffset: { width: 0, height: 0 },
  elevation: 20,
};

export default function SettingsModal({ visible, onClose }: Props) {
  const [cookie, setCookie] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (visible) getBilibiliCookie().then(setCookie);
    else setSaved(false);
  }, [visible]);

  const handleSave = async () => {
    await setBilibiliCookie(cookie);
    setSaved(true);
  };

  return (
    // skipcq: JS-0415
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={tw`flex-1 items-center justify-center bg-black/70 px-4`}
        onPress={onClose}
      >
        <Pressable
          onPress={() => undefined}
          style={[
            tw`w-full max-w-lg overflow-hidden rounded-3xl border border-primary/30 bg-[#0f172a]`,
            { maxHeight: '90%' },
            panelShadow,
          ]}
        >
          <View
            style={tw`flex-row items-center justify-between border-b border-white/5 px-5 py-4`}
          >
            <View style={tw`flex-row items-center`}>
              <SettingsIcon size={18} color="#22d3ee" />
              <Text style={tw`ml-2 font-mono-bold text-base text-white`}>
                Settings
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={tw`h-8 w-8 items-center justify-center rounded-full bg-black/50`}
            >
              <X size={18} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={tw`p-5`}
            keyboardShouldPersistTaps="handled"
          >
            <Text
              style={tw`font-mono-bold text-[11px] uppercase tracking-wider text-primary`}
            >
              Bilibili Cookie
            </Text>
            <Text
              style={tw`mt-1.5 font-mono text-[11px] leading-relaxed text-slate-400`}
            >
              Bilibili gates 1080p+ behind login. Paste your bilibili.tv cookie
              to unlock HD. Sign in at bilibili.tv in a browser, open DevTools →
              Application → Cookies, and copy the full cookie string.
            </Text>

            <TextInput
              value={cookie}
              onChangeText={(value) => {
                setCookie(value);
                setSaved(false);
              }}
              placeholder="SESSDATA=...; bili_jct=...; ..."
              placeholderTextColor="#5b6472"
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                tw`mt-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-xs text-white`,
                { minHeight: 90, textAlignVertical: 'top' },
              ]}
            />

            <TouchableOpacity
              onPress={handleSave}
              style={tw.style(
                'mt-4 flex-row items-center justify-center rounded-xl py-3',
                saved ? 'bg-emerald-500' : 'bg-primary'
              )}
            >
              <Check size={16} color="#030014" strokeWidth={4} />
              <Text style={tw`ml-1.5 font-mono-bold text-sm text-background`}>
                {saved ? 'Saved ✓' : 'Save Cookie'}
              </Text>
            </TouchableOpacity>

            <Text
              style={tw`mt-3 text-center font-mono text-[10px] text-slate-500`}
            >
              stored only on this device
            </Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
