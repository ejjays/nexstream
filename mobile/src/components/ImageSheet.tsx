import { useEffect, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  View,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
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

const SHEET_BG = '#0a1224';
const OPEN_SPRING = { damping: 24, stiffness: 210, mass: 0.9 };
const BOUNCE_SPRING = { damping: 15, stiffness: 220, mass: 0.6 };
const CLOSE_DURATION = 300;
const BACKDROP = 0.62;
const TAIL = 140;
const OVERMAX = 100;

const glowShadow = {
  shadowColor: '#06b6d4',
  shadowOpacity: 0.3,
  shadowRadius: 28,
  shadowOffset: { width: 0, height: -6 },
  elevation: 20,
};

type Props = {
  visible: boolean;
  onClose: () => void;
  image: number;
  children: ReactNode;
  imageRatio?: number;
  heightRatio?: number;
  overlayContent?: boolean;
  imageScale?: number;
  gridBackground?: boolean;
};

export default function ImageSheet({
  visible,
  onClose,
  image,
  children,
  imageRatio = 0.72,
  heightRatio = 0.84,
  overlayContent = true,
  imageScale = 1,
  gridBackground = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: screenH, width: screenW } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);

  const progress = useSharedValue(0);
  const overdrag = useSharedValue(0);

  const visibleH = Math.round(screenH * heightRatio);
  const totalH = visibleH + TAIL;
  const imageH = Math.round(visibleH * imageRatio);
  const sheetWidth = Math.min(screenW, 560);
  const stackedSize = Math.round(sheetWidth * imageScale);

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
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
  }, [visible, mounted, progress]);

  const finish = () => {
    setMounted(false);
    onClose();
  };

  const pan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onUpdate((e) => {
      if (e.translationY >= 0) {
        overdrag.value = 0;
        progress.value = Math.max(0, 1 - e.translationY / visibleH);
      } else {
        progress.value = 1;
        const pull = -e.translationY;
        overdrag.value = (pull * OVERMAX) / (pull + OVERMAX);
      }
    })
    .onEnd((e) => {
      overdrag.value = withSpring(0, BOUNCE_SPRING);
      const closing = e.translationY > visibleH * 0.3 || e.velocityY > 800;
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
      { translateY: TAIL + (1 - progress.value) * visibleH - overdrag.value },
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
              accessibilityLabel="Dismiss"
            />
          </Animated.View>

          <GestureDetector gesture={pan}>
            <Animated.View
              style={[
                tw`w-full self-center rounded-t-[32px]`,
                { height: totalH, maxWidth: 560, backgroundColor: SHEET_BG },
                glowShadow,
                sheetStyle,
              ]}
            >
              <View
                style={tw`flex-1 overflow-hidden rounded-t-[32px] border border-primary/40`}
              >
                {gridBackground ? (
                  <GridBackground width={sheetWidth} height={totalH} />
                ) : null}
                {overlayContent ? (
                  <>
                    <Image
                      source={image}
                      style={[
                        tw`absolute left-0 right-0 top-0`,
                        { height: imageH },
                      ]}
                      contentFit="cover"
                    />
                    <LinearGradient
                      colors={['transparent', SHEET_BG]}
                      locations={[0.3, 0.6]}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="none"
                    />
                  </>
                ) : null}

                <View
                  style={tw`absolute left-0 right-0 top-3 items-center`}
                  pointerEvents="none"
                >
                  <View style={tw`h-1.5 w-12 rounded-full bg-white/70`} />
                </View>

                {overlayContent ? (
                  <View
                    style={[
                      tw`flex-1 justify-end px-6`,
                      { paddingBottom: insets.bottom + 18 + TAIL },
                    ]}
                  >
                    {children}
                  </View>
                ) : (
                  <>
                    <View style={tw`flex-1 items-center justify-center`}>
                      <Image
                        source={image}
                        style={{ width: stackedSize, height: stackedSize }}
                        contentFit="contain"
                      />
                    </View>
                    <View
                      style={[
                        tw`px-6`,
                        { paddingBottom: insets.bottom + 18 + TAIL },
                      ]}
                    >
                      {children}
                    </View>
                  </>
                )}
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
