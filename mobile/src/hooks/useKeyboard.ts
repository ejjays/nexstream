import { useEffect, type RefObject } from 'react';
import { type TextInput } from 'react-native';
import {
  KeyboardEvents,
  useGenericKeyboardHandler,
} from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';

export function useBlurOnKeyboardHide(ref: RefObject<TextInput | null>) {
  useEffect(() => {
    const sub = KeyboardEvents.addListener('keyboardWillHide', () => {
      ref.current?.blur();
    });
    return () => sub.remove();
  }, [ref]);
}

// transform lift, no layout pass = smooth
// modal needs its own KeyboardProvider
export function useKeyboardLift(gap = 12) {
  const insets = useSafeAreaInsets();
  const kb = useSharedValue(0);
  useGenericKeyboardHandler(
    {
      onMove: (event) => {
        'worklet';
        kb.value = event.height;
      },
      onEnd: (event) => {
        'worklet';
        kb.value = event.height;
      },
    },
    []
  );
  return useAnimatedStyle(() => ({
    paddingBottom: insets.bottom + gap,
    transform: [{ translateY: -Math.max(0, kb.value - insets.bottom) }],
  }));
}
