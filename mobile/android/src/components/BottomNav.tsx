import { useState, type ComponentType } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import tw from '../lib/tw';

type Tab = 'home' | 'settings' | 'docs';
type IconProps = { size?: number; color?: string };

function HomeIcon({ size = 24, color = '#000000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        fillRule="evenodd"
        d="M2.5192 7.82274C2 8.77128 2 9.91549 2 12.2039V13.725C2 17.6258 2 19.5763 3.17157 20.7881C4.34315 22 6.22876 22 10 22H14C17.7712 22 19.6569 22 20.8284 20.7881C22 19.5763 22 17.6258 22 13.725V12.2039C22 9.91549 22 8.77128 21.4808 7.82274C20.9616 6.87421 20.0131 6.28551 18.116 5.10812L16.116 3.86687C14.1106 2.62229 13.1079 2 12 2C10.8921 2 9.88939 2.62229 7.88403 3.86687L5.88403 5.10813C3.98695 6.28551 3.0384 6.87421 2.5192 7.82274ZM11.25 18C11.25 18.4142 11.5858 18.75 12 18.75C12.4142 18.75 12.75 18.4142 12.75 18V15C12.75 14.5858 12.4142 14.25 12 14.25C11.5858 14.25 11.25 14.5858 11.25 15V18Z"
        fill={color}
      />
    </Svg>
  );
}

function SettingsIcon({ size = 24, color = '#000000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        fillRule="evenodd"
        d="M10.75,2.56687 C11.5235,2.12029 12.4765,2.12029 13.25,2.56687 L13.25,2.56687 L19.5443,6.20084 C20.3178,6.64743 20.7943,7.47274 20.7943,8.36591 L20.7943,8.36591 L20.7943,15.6339 C20.7943,16.527 20.3178,17.3523 19.5443,17.7989 L19.5443,17.7989 L13.25,21.4329 C12.4765,21.8795 11.5235,21.8795 10.75,21.4329 L10.75,21.4329 L4.45581,17.7989 C3.68231,17.3523 3.20581,16.527 3.20581,15.6339 L3.20581,15.6339 L3.20581,8.36591 C3.20581,7.47274 3.68231,6.64743 4.45581,6.20084 L4.45581,6.20084 L10.75,2.56687 Z M12.0000075,8.99989 C10.3431491,8.99989 9.0000075,10.3430316 9.0000075,11.99989 C9.0000075,13.6567184 10.3431491,14.99989 12.0000075,14.99989 C13.6568209,14.99989 14.9999925,13.6567184 14.9999925,11.99989 C14.9999925,10.3430316 13.6568209,8.99989 12.0000075,8.99989 Z"
        fill={color}
      />
    </Svg>
  );
}

function DocsIcon({ size = 24, color = '#000000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10.063 21.7917C10.3894 22.1483 11 21.9534 11 21.4699V4C10 3 8.91255 2.57151 7.78361 2.32246C5.78311 1.88113 4.0024 1.97693 2.91265 2.11876C1.70543 2.27587 1 3.34931 1 4.40561V17.5662C1 18.9895 2.18834 20.1115 3.56807 20.066C4.71011 20.0284 6.2952 20.0688 7.73105 20.4158C8.82596 20.6803 9.52237 21.2009 10.063 21.7917Z"
        fill={color}
      />
      <Path
        d="M13.937 21.7917C13.6106 22.1483 13 21.9534 13 21.4699V4C14 3 15.0874 2.57151 16.2164 2.32246C18.2169 1.88113 19.9976 1.97693 21.0873 2.11876C22.2946 2.27587 23 3.34931 23 4.40561V17.5662C23 18.9895 21.8117 20.1115 20.4319 20.066C19.2899 20.0284 17.7048 20.0688 16.269 20.4158C15.174 20.6803 14.4776 21.2009 13.937 21.7917Z"
        fill={color}
      />
    </Svg>
  );
}

const TABS: { id: Tab; label: string; Icon: ComponentType<IconProps> }[] = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
  { id: 'docs', label: 'Docs', Icon: DocsIcon },
];

const TAB_W = 78;
const TAB_H = 58;
const PAD = 6;
const RADIUS = (TAB_H + PAD * 2) / 2;
const GLOW_W = 26;
const GLOW_LEFT = PAD + (TAB_W - GLOW_W) / 2;

const styles = StyleSheet.create({
  bar: {
    alignSelf: 'center',
    marginBottom: 16,
    flexDirection: 'row',
    padding: PAD,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: '#2a3350',
    backgroundColor: '#141a2c',
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  card: {
    position: 'absolute',
    top: PAD,
    left: PAD,
    width: TAB_W,
    height: TAB_H,
  },
  cardFace: {
    flex: 1,
    borderRadius: TAB_H / 2,
    borderWidth: 1,
    borderColor: '#3b466b',
  },
  tab: {
    width: TAB_W,
    height: TAB_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    left: GLOW_LEFT,
    bottom: -7,
    width: GLOW_W,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#22d3ee',
    shadowColor: '#22d3ee',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
});

export default function BottomNav() {
  const [active, setActive] = useState(0);
  const pos = useSharedValue(0);

  const select = (index: number) => {
    pos.value = withTiming(index, {
      duration: 600,
      easing: Easing.bezier(0.76, 0, 0.24, 1),
    });
    setActive(index);
  };

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { translateX: pos.value * TAB_W },
      { rotateY: `${pos.value * 180}deg` },
      { scale: interpolate(pos.value % 1, [0, 0.5, 1], [1, 1.06, 1]) },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pos.value * TAB_W }],
  }));

  return (
    <View style={styles.bar}>
      <Animated.View style={[styles.card, cardStyle]}>
        <LinearGradient
          colors={['#323d63', '#202942'] as const}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cardFace}
        />
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.glow, glowStyle]} />

      {TABS.map(({ id, label, Icon }, index) => {
        const isActive = index === active;
        const color = isActive ? '#22d3ee' : '#64748b';
        return (
          <Pressable key={id} onPress={() => select(index)} style={styles.tab}>
            <Icon size={24} color={color} />
            <Text style={[tw`mt-1 text-[10px] font-mono-semibold`, { color }]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
