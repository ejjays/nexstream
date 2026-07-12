import { memo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Plus } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import tw from '../lib/tw';

const PLATFORMS = [
  'YouTube',
  'Spotify',
  'Facebook',
  'Instagram',
  'TikTok',
  'Threads',
  'Vimeo',
  'Bilibili',
  'Dailymotion',
  'Pinterest',
  'Reddit',
  'SoundCloud',
  'X (Twitter)',
  'Bluesky',
  'Twitch',
];

function Header() {
  const [open, setOpen] = useState(false);
  const rot = useSharedValue(0);
  const panelY = useSharedValue(0);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggle = (next: boolean) => {
    rot.value = withTiming(next ? 1 : 0, { duration: 200 });
    panelY.value = withTiming(next ? 0 : 20, { duration: 220 });
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (next) {
      openTimer.current = setTimeout(() => setOpen(true), 10);
    } else {
      setOpen(false);
    }
  };

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value * 45}deg` }],
  }));

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: panelY.value }],
    opacity: 1 - Math.max(0, panelY.value / 20) * 0.3,
  }));

  return (
    <View style={tw`items-center pb-4 pt-2`}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => toggle(true)}
        style={[
          tw`flex-row items-center gap-3 rounded-full border border-[#2a3350] px-3.5 py-1.5`,
          { backgroundColor: '#050d22' },
        ]}
      >
        <Animated.View
          style={[
            tw`rounded-full border border-primary/40 bg-primary/20 p-1`,
            iconStyle,
          ]}
        >
          <Plus size={14} color="#22d3ee" />
        </Animated.View>
        <Text style={tw`text-xs font-mono-medium tracking-wide text-cyan-50`}>
          supported platforms
        </Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={() => toggle(false)}
      >
        <Animated.View
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(220)}
          style={tw`absolute inset-0 bg-black/60`}
        >
          <Pressable style={tw`flex-1`} onPress={() => toggle(false)} />
        </Animated.View>
        <Animated.View
          style={[
            tw`mt-24 w-11/12 max-w-lg self-center rounded-2xl border border-white/10 bg-[#0f172a] p-3`,
            panelStyle,
          ]}
        >
          <View style={tw`flex-row flex-wrap`}>
            {PLATFORMS.map((platform) => (
              <View
                key={platform}
                style={tw`m-1 rounded-full border border-primary/20 bg-white/5 px-3 py-1`}
              >
                <Text style={tw`text-sm font-mono-semibold text-cyan-300`}>
                  {platform}
                </Text>
              </View>
            ))}
          </View>
          <Text
            style={tw`mt-3 border-t border-white/5 pt-2 font-mono text-[11px] leading-5 text-slate-500`}
          >
            running fully on your device — more platforms coming soon.
          </Text>
        </Animated.View>
      </Modal>
    </View>
  );
}

export default memo(Header);
