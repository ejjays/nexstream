import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Plus } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import tw from '../lib/tw';

const PLATFORMS = ['Facebook', 'TikTok', 'X (Twitter)', 'Threads'];

export default function Header() {
  const [open, setOpen] = useState(false);
  const rot = useSharedValue(0);

  const toggle = (next: boolean) => {
    setOpen(next);
    rot.value = withTiming(next ? 1 : 0, { duration: 200 });
  };

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value * 90}deg` }],
  }));

  return (
    <View style={tw`items-center pb-4 pt-2`}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => toggle(true)}
        style={tw`flex-row items-center gap-3 rounded-full border border-primary/30 bg-white/5 px-3.5 py-1.5`}
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
        animationType="fade"
        onRequestClose={() => toggle(false)}
      >
        <Pressable
          style={tw`absolute inset-0 bg-black/80`}
          onPress={() => toggle(false)}
        />
        <View
          style={tw`mt-24 w-11/12 max-w-lg self-center rounded-2xl border border-white/10 bg-[#0f172a] p-3`}
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
        </View>
      </Modal>
    </View>
  );
}
