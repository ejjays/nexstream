import { useEffect, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  Keyboard,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import tw from '../lib/tw';
import GridBackground from './GridBackground';

const OPEN_SPRING = { damping: 24, stiffness: 210, mass: 0.9 };
const BOUNCE_SPRING = { damping: 15, stiffness: 220, mass: 0.6 };
const CLOSE_DURATION = 300;
const KB_DURATION = 240;
const BACKDROP = 0.62;
const TAIL = 140;
const OVERMAX = 100;
const FULL_RATIO = 0.88;
const REST_RATIO = 0.5;
const glowShadow = {
  shadowColor: '#06b6d4',
  shadowOpacity: 0.3,
  shadowRadius: 28,
  shadowOffset: { width: 0, height: -6 },
  elevation: 20,
};

export default function BottomSheet({
  open,
  onClose,
  children,
  footer,
  keyboardMode = 'lift',
  restRatio = REST_RATIO,
  showGrid = true,
  border = 'cyan',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  keyboardMode?: 'lift' | 'expand';
  restRatio?: number;
  showGrid?: boolean;
  border?: 'cyan' | 'subtle';
}) {
  const insets = useSafeAreaInsets();
  const { height: screenH, width: screenW } = useWindowDimensions();
  const [mounted, setMounted] = useState(open);
  const [gridHeight, setGridHeight] = useState(0);

  const progress = useSharedValue(0);
  const overdrag = useSharedValue(0);
  const sheetH = useSharedValue(screenH);
  const keyboard = useSharedValue(0);
  const grow = useSharedValue(0);

  const isExpand = keyboardMode === 'expand';
  const hidden = screenH * (FULL_RATIO - restRatio);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      keyboard.value = withTiming(event.endCoordinates.height, {
        duration: KB_DURATION,
      });
      grow.value = withTiming(1, { duration: KB_DURATION });
    });
    const hideEvent = Keyboard.addListener('keyboardDidHide', () => {
      keyboard.value = withTiming(0, { duration: KB_DURATION });
      grow.value = withTiming(0, { duration: KB_DURATION });
    });
    return () => {
      show.remove();
      hideEvent.remove();
    };
  }, [keyboard, grow]);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  const finish = () => {
    setMounted(false);
    onClose();
  };

  useEffect(() => {
    if (!mounted) return;
    if (open) {
      progress.value = withSpring(1, OPEN_SPRING);
    } else {
      progress.value = withTiming(
        0,
        { duration: CLOSE_DURATION, easing: Easing.out(Easing.cubic) },
        (done) => {
          if (done) runOnJS(setMounted)(false);
        }
      );
    }
  }, [open, mounted, progress]);

  const onSheetLayout = (e: LayoutChangeEvent) => {
    const height = e.nativeEvent.layout.height;
    if (height > 0) {
      sheetH.value = height;
      setGridHeight(height);
    }
  };

  const pan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onUpdate((e) => {
      if (e.translationY >= 0) {
        overdrag.value = 0;
        const visible = sheetH.value - TAIL;
        progress.value = Math.max(0, 1 - e.translationY / visible);
      } else {
        progress.value = 1;
        const pull = -e.translationY;
        overdrag.value = (pull * OVERMAX) / (pull + OVERMAX);
      }
    })
    .onEnd((e) => {
      overdrag.value = withSpring(0, BOUNCE_SPRING);
      const visible = sheetH.value - TAIL;
      const closing = e.translationY > visible * 0.3 || e.velocityY > 800;
      if (e.translationY > 0 && closing) {
        progress.value = withTiming(
          0,
          { duration: CLOSE_DURATION, easing: Easing.out(Easing.cubic) },
          (done) => {
            if (done) runOnJS(finish)();
          }
        );
      } else {
        progress.value = withSpring(1, OPEN_SPRING);
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * BACKDROP,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          TAIL +
          (1 - progress.value) * (sheetH.value - TAIL) -
          overdrag.value +
          (isExpand ? (1 - grow.value) * hidden : 0) -
          (isExpand ? 0 : keyboard.value),
      },
    ],
  }));

  const footerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -((1 - grow.value) * hidden) - keyboard.value }],
  }));

  const expandStyle = isExpand ? { height: screenH * FULL_RATIO + TAIL } : null;

  if (!mounted) return null;

  return (
    // skipcq: JS-0415
    <Modal
      visible
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={tw`flex-1`}>
        <View style={tw`flex-1 justify-end`}>
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            <Pressable
              style={tw`flex-1 bg-black`}
              onPress={onClose}
              accessibilityLabel="Close"
            />
          </Animated.View>

          <GestureDetector gesture={pan}>
            <Animated.View
              onLayout={onSheetLayout}
              style={[
                tw`w-full self-center overflow-hidden rounded-t-[28px] bg-[#0a1224] px-4 pt-3`,
                border === 'subtle'
                  ? tw`border border-white/10`
                  : tw`border border-primary/40`,
                glowShadow,
                {
                  paddingBottom: insets.bottom + 20 + TAIL,
                  maxHeight: screenH * 0.92 + TAIL,
                  maxWidth: 560,
                },
                expandStyle,
                sheetStyle,
              ]}
            >
              {showGrid ? (
                <GridBackground
                  width={Math.min(screenW, 560)}
                  height={gridHeight || screenH}
                />
              ) : null}
              <View
                style={tw`mb-5 h-1.5 w-10 self-center rounded-full bg-white/20`}
              />
              {children}
              {footer ? (
                <Animated.View style={[tw`bg-[#0a1224] pt-2`, footerStyle]}>
                  {footer}
                </Animated.View>
              ) : null}
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
