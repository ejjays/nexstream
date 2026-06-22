import { useState, memo, type ComponentType } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useFrameCallback,
  withTiming,
  withSpring,
  withSequence,
  interpolate,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import tw from '../lib/tw';

type Tab = 'home' | 'settings' | 'updates';
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

function UpdatesIcon({ size = 24, color = '#000000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G rotation={180} originX={12} originY={12}>
        <Path
          d="M11.8115 6.72682C12.8248 4.90902 13.3315 4.00012 14.089 4.00012C14.8465 4.00012 15.3531 4.90902 16.3665 6.72682L16.6286 7.19711C16.9166 7.71367 17.0605 7.97195 17.285 8.14237C17.5095 8.31278 17.7891 8.37604 18.3483 8.50256L18.8574 8.61774C20.8251 9.06297 21.809 9.28558 22.0431 10.0383C22.2771 10.791 21.6064 11.5754 20.2649 13.1441L19.9179 13.5499C19.5366 13.9957 19.346 14.2186 19.2603 14.4943C19.1746 14.77 19.2034 15.0674 19.261 15.6622L19.3135 16.2036C19.5163 18.2966 19.6177 19.3431 19.0049 19.8083C18.392 20.2735 17.4708 19.8494 15.6285 19.0011L15.1518 18.7816C14.6282 18.5405 14.3665 18.42 14.089 18.42C13.8115 18.42 13.5497 18.5405 13.0262 18.7816L12.5495 19.0011C10.7071 19.8494 9.78593 20.2735 9.17311 19.8083C8.56029 19.3431 8.66169 18.2966 8.86451 16.2036L8.91698 15.6622C8.97461 15.0674 9.00343 14.77 8.91768 14.4943C8.83193 14.2186 8.64133 13.9957 8.26012 13.5499L7.91307 13.1441C6.57159 11.5754 5.90085 10.791 6.13492 10.0383C6.369 9.28558 7.35287 9.06297 9.32062 8.61774L9.8297 8.50256C10.3889 8.37604 10.6685 8.31278 10.8929 8.14237C11.1174 7.97195 11.2614 7.71367 11.5494 7.19711L11.8115 6.72682Z"
          fill={color}
        />
        <Path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M8.74549 5.20241C6.76387 4.63138 4.63821 4.933 2.58729 6.13407L2.37913 6.25598C2.0217 6.4653 1.56226 6.34523 1.35293 5.9878C1.14361 5.63037 1.26368 5.17092 1.62111 4.9616L1.82927 4.8397C4.18969 3.45737 6.73702 3.0626 9.16083 3.76106L9.36871 3.82096C9.76673 3.93566 9.99641 4.35129 9.88171 4.74931C9.76702 5.14733 9.35139 5.37701 8.95337 5.26231L8.74549 5.20241ZM4.83628 9.93646C4.87144 10.3492 4.56537 10.7123 4.15265 10.7474C3.99949 10.7605 3.88206 10.7679 3.78365 10.7742C3.60627 10.7854 3.49069 10.7928 3.33902 10.8219C3.14253 10.8596 2.8874 10.9394 2.4244 11.1709C2.05391 11.3562 1.60341 11.206 1.41817 10.8355C1.23293 10.465 1.38309 10.0145 1.75358 9.8293C2.29057 9.5608 2.68032 9.42092 3.05627 9.34876C3.30317 9.30137 3.55804 9.28477 3.78724 9.26984C3.87053 9.26441 3.95043 9.25921 4.02533 9.25283C4.43804 9.21767 4.80112 9.52374 4.83628 9.93646ZM5.91788 15.8561C4.73392 15.5786 3.48653 15.8538 2.55316 16.5892C2.22781 16.8456 1.75624 16.7896 1.49988 16.4643C1.24353 16.1389 1.29946 15.6674 1.62482 15.411C2.92261 14.3884 4.63911 14.0158 6.2601 14.3956C6.66339 14.4901 6.91371 14.8937 6.81921 15.297C6.72471 15.7003 6.32117 15.9506 5.91788 15.8561Z"
          fill={color}
        />
      </G>
    </Svg>
  );
}

const TABS: { id: Tab; label: string; Icon: ComponentType<IconProps> }[] = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
  { id: 'updates', label: 'Updates', Icon: UpdatesIcon },
];

const TAB_W = 78;
const TAB_H = 58;
const PAD = 6;
const RADIUS = (TAB_H + PAD * 2) / 2;
const GLOW_W = 26;
const GLOW_LEFT = PAD + (TAB_W - GLOW_W) / 2;
const BAR_W = TAB_W * 3 + PAD * 2;
const BAR_H = TAB_H + PAD * 2;
const MAX_INDEX = TABS.length - 1;

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    marginBottom: 16,
  },
  bg: {
    width: BAR_W,
    height: BAR_H,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: 'rgb(69,69,69)',
    backgroundColor: '#040c24',
    opacity: 0.7,
    overflow: 'hidden',
  },
  gloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: BAR_H * 0.5,
  },
  row: {
    flexDirection: 'row',
    padding: PAD,
  },
  bubble: {
    position: 'absolute',
    top: PAD,
    left: PAD,
    width: TAB_W,
    height: TAB_H,
  },
  bubbleFace: {
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

function BottomNav({ onChange }: { onChange?: (tab: Tab) => void }) {
  const [active, setActive] = useState(0);
  const pos = useSharedValue(0);

  const commit = (index: number) => {
    setActive(index);
    onChange?.(TABS[index].id);
  };
  const startPos = useSharedValue(0);
  const wobble = useSharedValue(1);
  const pressed = useSharedValue(1);
  const insideBar = useSharedValue(true);
  const stretch = useSharedValue(0);
  const prevPos = useSharedValue(0);
  const dragging = useSharedValue(false);
  const dragTarget = useSharedValue(0);

  useFrameCallback(() => {
    const target = dragging.value
      ? Math.min(Math.abs(dragTarget.value - pos.value) * 3, 1)
      : Math.min(Math.abs(pos.value - prevPos.value) * 16, 1);
    prevPos.value = pos.value;
    const next = stretch.value + (target - stretch.value) * 0.5;
    stretch.value = next < 0.0015 && target < 0.0015 ? 0 : next;
  });

  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .onBegin(() => {
      startPos.value = pos.value;
      dragTarget.value = pos.value;
      dragging.value = true;
      insideBar.value = true;
      pressed.value = withSpring(0.9, { damping: 15, stiffness: 250 });
    })
    .onUpdate((e) => {
      const inside = e.x >= 0 && e.x <= BAR_W && e.y >= 0 && e.y <= BAR_H;
      if (inside !== insideBar.value) {
        insideBar.value = inside;
        pressed.value = withSpring(inside ? 0.9 : 1, {
          damping: 15,
          stiffness: 250,
        });
      }
      const next = startPos.value + e.translationX / TAB_W;
      const clamped = Math.max(0, Math.min(MAX_INDEX, next));
      dragTarget.value = clamped;
      pos.value = withSpring(clamped, {
        damping: 18,
        stiffness: 90,
        mass: 0.6,
      });
    })
    .onEnd((e) => {
      const projected = pos.value + (e.velocityX / TAB_W) * 0.12;
      const target = Math.max(0, Math.min(MAX_INDEX, Math.round(projected)));
      pos.value = withTiming(target, {
        duration: 400,
        easing: Easing.out(Easing.cubic),
      });
      const inside = e.x >= 0 && e.x <= BAR_W && e.y >= 0 && e.y <= BAR_H;
      if (inside) {
        wobble.value = withSequence(
          withTiming(0.9, { duration: 80 }),
          withSpring(1, { damping: 13, stiffness: 230 })
        );
      }
      runOnJS(commit)(target);
    })
    .onFinalize(() => {
      dragging.value = false;
      pressed.value = withSpring(1, { damping: 14, stiffness: 200 });
    });

  const select = (index: number) => {
    if (index === active) return;
    pos.value = withTiming(index, {
      duration: 340,
      easing: Easing.out(Easing.cubic),
    });
    wobble.value = withSequence(
      withTiming(0.88, { duration: 90 }),
      withSpring(1, { damping: 13, stiffness: 230 })
    );
    commit(index);
  };

  const bubbleStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: pos.value * TAB_W },
        { scale: wobble.value * pressed.value },
        { scaleX: interpolate(stretch.value, [0, 1], [1, 1.22]) },
        { scaleY: interpolate(stretch.value, [0, 1], [1, 0.9]) },
      ],
    };
  });

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pos.value * TAB_W }],
  }));

  const barContent = (
    <>
      <Animated.View style={[styles.bubble, bubbleStyle]}>
        <LinearGradient
          colors={['rgba(150,180,255,0.22)', 'rgba(150,180,255,0.05)'] as const}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.bubbleFace}
        />
      </Animated.View>

      {TABS.map(({ id, label, Icon }, index) => {
        const isActive = index === active;
        const color = isActive ? '#22d3ee' : '#cbd5e1';
        return (
          <Pressable key={id} onPress={() => select(index)} style={styles.tab}>
            <Icon size={24} color={color} />
            <Text style={[tw`mt-1 text-[10px] font-mono-semibold`, { color }]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </>
  );

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.wrap}>
        <View style={styles.bg}>
          <LinearGradient
            colors={['rgba(44,52,165,0.32)', 'rgba(20,28,52,0.42)'] as const}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0)'] as const}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.gloss}
          />
          <LinearGradient
            colors={
              [
                'rgba(255,255,255,0.03)',
                'rgba(255,255,255,0.02)',
                'rgba(255,255,255,0.03)',
              ] as const
            }
            locations={[0.1, 0.5, 0.9]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </View>

        <View
          pointerEvents="box-none"
          style={[StyleSheet.absoluteFill, styles.row]}
        >
          {barContent}
        </View>

        <Animated.View pointerEvents="none" style={[styles.glow, glowStyle]} />
      </View>
    </GestureDetector>
  );
}

export default memo(BottomNav);
