import { useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import tw from '../lib/tw';

type GlowButtonProps = {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export default function GlowButton({
  label,
  loading,
  disabled,
  onPress,
}: GlowButtonProps) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [pulse]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + pulse.value * 0.45,
    transform: [{ scale: 1 + pulse.value * 0.06 }],
  }));

  return (
    // skipcq: JS-0415
    <View style={tw`mt-4`}>
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', top: -28, left: -28, right: -28, bottom: -28 },
          haloStyle,
        ]}
      >
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#22d3ee" stopOpacity={0.55} />
              <Stop offset="45%" stopColor="#0e7490" stopOpacity={0.3} />
              <Stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#halo)" />
        </Svg>
      </Animated.View>

      <TouchableOpacity
        disabled={disabled}
        onPress={onPress}
        activeOpacity={0.85}
        style={tw.style('rounded-3xl', disabled && 'opacity-50')}
      >
        <LinearGradient
          colors={['#00c0b7', '#002396'] as const}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={tw`items-center justify-center rounded-3xl py-4`}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text
              style={tw`text-[15px] font-mono-bold uppercase tracking-wider text-white`}
            >
              {label}
            </Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}
