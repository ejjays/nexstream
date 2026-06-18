import { Text, Pressable, ActivityIndicator } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import tw from '../lib/tw';

type Button3DProps = {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

const LIFT = 5;

export default function Button3D({
  label,
  loading,
  disabled,
  onPress,
}: Button3DProps) {
  const down = useSharedValue(0);

  const faceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -LIFT + down.value * LIFT }],
  }));

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        down.value = withTiming(1, { duration: 50 });
      }}
      onPressOut={() => {
        down.value = withTiming(0, { duration: 50 });
      }}
      style={[tw`mt-4 rounded-full bg-cyan-800`, disabled && tw`opacity-50`]}
    >
      <Animated.View
        style={[
          tw`w-full items-center justify-center rounded-full bg-cyan-500 py-3`,
          faceStyle,
        ]}
      >
        {loading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text
            style={tw`text-lg font-mono-bold uppercase tracking-wider text-white`}
          >
            {label}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
}
