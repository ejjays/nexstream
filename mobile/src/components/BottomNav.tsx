import { useState, useEffect, memo, type ComponentType } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
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
import { HomeIcon, SettingsIcon, UpdatesIcon, type IconProps } from './icons';

type Tab = 'home' | 'settings' | 'updates';

const TABS: { id: Tab; label: string; Icon: ComponentType<IconProps> }[] = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'updates', label: 'Updates', Icon: UpdatesIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
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

function BottomNav({
  onChange,
  hidden = false,
}: {
  onChange?: (tab: Tab) => void;
  hidden?: boolean;
}) {
  const [active, setActive] = useState(0);
  const pos = useSharedValue(0);
  const hide = useSharedValue(0);
  useEffect(() => {
    hide.value = withTiming(hidden ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [hidden, hide]);
  const hideStyle = useAnimatedStyle(() => ({
    opacity: 1 - hide.value,
    transform: [{ translateY: hide.value * 130 }],
  }));

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
    .enabled(!hidden)
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
      <Animated.View
        pointerEvents={hidden ? 'none' : 'auto'}
        style={[styles.wrap, hideStyle]}
      >
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
      </Animated.View>
    </GestureDetector>
  );
}

export default memo(BottomNav);
