import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
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
  interpolate,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import tw from '../lib/tw';
import { tapSelection } from '../lib/haptics';

const SPRING = { damping: 24, stiffness: 210, mass: 0.9 };
const FOCUS_MS = 260;
const FOCUS_DISMISS = 130;
const FOCUS_VELOCITY = 600;

export type FocusOrigin = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// tap-to-fullscreen zoom + pan-to-dismiss, mirroring UpdateDetailSheet's hero
// focus. caller passes the aspect (already known from the displayed image) so
// the focus box is stable & never resizes mid-animation (which would flicker)
export default function ImageFocusOverlay({
  uri,
  origin,
  aspect,
  onClose,
}: {
  uri: string | null;
  origin: FocusOrigin | null;
  aspect: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height: screenH, width: screenW } = useWindowDimensions();
  const [mounted, setMounted] = useState(false);

  const focus = useSharedValue(0);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);

  const open = uri !== null && origin !== null;

  useEffect(() => {
    if (!open) return;
    tapSelection();
    dragX.value = 0;
    dragY.value = 0;
    setMounted(true);
    focus.value = withTiming(1, {
      duration: FOCUS_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [open, dragX, dragY, focus]);

  const close = () => {
    focus.value = withTiming(
      0,
      { duration: FOCUS_MS, easing: Easing.out(Easing.cubic) },
      (done) => {
        if (done) runOnJS(setMounted)(false);
      }
    );
    onClose();
  };

  const focusPan = Gesture.Pan()
    .onUpdate((e) => {
      dragX.value = e.translationX;
      dragY.value = e.translationY;
    })
    .onEnd((e) => {
      const dist = Math.sqrt(
        e.translationX * e.translationX + e.translationY * e.translationY
      );
      const speed = Math.sqrt(
        e.velocityX * e.velocityX + e.velocityY * e.velocityY
      );
      if (dist > FOCUS_DISMISS || speed > FOCUS_VELOCITY) {
        runOnJS(close)();
      } else {
        dragX.value = withSpring(0, SPRING);
        dragY.value = withSpring(0, SPRING);
      }
    });

  const focusBox =
    aspect >= screenW / screenH
      ? { width: screenW, height: screenW / aspect }
      : { width: screenH * aspect, height: screenH };
  // start the zoom from the tapped image's vertical center, generalizing the
  // sheet's fixed hero center so it works wherever the image sits
  const originCenterY = (origin?.y ?? 0) + (origin?.height ?? 0) / 2;
  const startY = originCenterY - screenH / 2;

  const backdropStyle = useAnimatedStyle(() => {
    const dist = Math.min(
      Math.sqrt(dragX.value * dragX.value + dragY.value * dragY.value),
      300
    );
    return { opacity: focus.value * (1 - (dist / 300) * 0.85) };
  });

  const imgStyle = useAnimatedStyle(() => {
    const dist = Math.min(
      Math.sqrt(dragX.value * dragX.value + dragY.value * dragY.value),
      360
    );
    const dragScale = 1 - (dist / 360) * 0.12;
    return {
      opacity: focus.value,
      transform: [
        { translateX: dragX.value },
        {
          translateY:
            interpolate(focus.value, [0, 1], [startY, 0]) + dragY.value,
        },
        { scale: interpolate(focus.value, [0, 1], [0.72, 1]) * dragScale },
      ],
    };
  });

  if (!mounted || !origin || !uri) return null;

  return (
    // skipcq: JS-0415
    <Modal
      visible
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={close}
    >
      <GestureHandlerRootView style={tw`flex-1`}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable
            style={tw`flex-1 bg-black`}
            onPress={close}
            accessibilityLabel="Close image"
          />
        </Animated.View>
        <View
          style={[StyleSheet.absoluteFill, tw`items-center justify-center`]}
          pointerEvents="box-none"
        >
          <GestureDetector gesture={focusPan}>
            <Animated.View style={[focusBox, imgStyle]}>
              <Image
                source={{ uri }}
                style={tw`h-full w-full`}
                contentFit="cover"
                transition={150}
              />
            </Animated.View>
          </GestureDetector>
        </View>
        <Pressable
          onPress={close}
          style={[
            tw`absolute right-4 h-10 w-10 items-center justify-center rounded-full bg-white/10`,
            { top: insets.top + 8 },
          ]}
        >
          <X size={22} color="#fff" />
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}
