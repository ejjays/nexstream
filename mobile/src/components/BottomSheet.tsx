import { useEffect, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
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
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import tw from '../lib/tw';

const OPEN_SPRING = { damping: 22, stiffness: 240, mass: 0.85 };
const CLOSE_SPRING = { damping: 26, stiffness: 240, overshootClamping: true };
const BOUNCE_SPRING = { damping: 15, stiffness: 220, mass: 0.6 };
const BACKDROP = 0.62;
const TAIL = 140;
const OVERMAX = 100;

export default function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const [mounted, setMounted] = useState(open);

  const progress = useSharedValue(0);
  const overdrag = useSharedValue(0);
  const sheetH = useSharedValue(screenH);

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
      progress.value = withSpring(0, CLOSE_SPRING, (done) => {
        if (done) runOnJS(setMounted)(false);
      });
    }
  }, [open, mounted, progress]);

  const onSheetLayout = (e: LayoutChangeEvent) => {
    const height = e.nativeEvent.layout.height;
    if (height > 0) sheetH.value = height;
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
      const velocity = -e.velocityY / visible;
      const closing = e.translationY > visible * 0.4 || e.velocityY > 900;
      if (e.translationY > 0 && closing) {
        progress.value = withSpring(
          0,
          { ...CLOSE_SPRING, velocity },
          (done) => {
            if (done) runOnJS(finish)();
          }
        );
      } else {
        progress.value = withSpring(1, { ...OPEN_SPRING, velocity });
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * BACKDROP,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          TAIL + (1 - progress.value) * (sheetH.value - TAIL) - overdrag.value,
      },
    ],
  }));

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
                tw`rounded-t-[28px] border-t border-white/10 bg-[#0a1224] px-4 pt-3`,
                {
                  paddingBottom: insets.bottom + 20 + TAIL,
                  maxHeight: screenH * 0.9 + TAIL,
                },
                sheetStyle,
              ]}
            >
              <View
                style={tw`mb-5 h-1.5 w-10 self-center rounded-full bg-white/20`}
              />
              {children}
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
