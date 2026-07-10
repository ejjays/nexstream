import { memo, useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { useScreenSize } from '../../hooks/useScreenSize';
import tw from '../../lib/tw';

const LAYERS = [0, 1, 2] as const;
const LAYER_DELAYS = [0, 1100, 2200];
const LAYER_DURATIONS = [2400, 2800, 3200];
const PER_LAYER = 18;
const MIN_OPACITY = 0.25;
const STAR_COLOR = '#ffffff';

type Star = { id: string; x: number; y: number; size: number };

function makeStars(layer: number, width: number, height: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < PER_LAYER; i++) {
    stars.push({
      id: `${layer}-${i}`,
      x: Math.random() * width,
      y: Math.random() * height,
      size: 1.5 + Math.random() * 1.5,
    });
  }
  return stars;
}

function StarLayer({
  stars,
  opacity,
  color,
}: {
  stars: Star[];
  opacity: SharedValue<number>;
  color: string;
}) {
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[tw`absolute inset-0`, style]}>
      {stars.map((s) => (
        <View
          key={s.id}
          style={{
            position: 'absolute',
            left: s.x,
            top: s.y,
            width: s.size,
            height: s.size,
            borderRadius: s.size / 2,
            backgroundColor: color,
          }}
        />
      ))}
    </Animated.View>
  );
}

function TwinkleStars({
  color = STAR_COLOR,
  width: widthProp,
  height: heightProp,
}: {
  color?: string;
  width?: number;
  height?: number;
}) {
  const screen = useScreenSize();
  const width = widthProp ?? screen.width;
  const height = heightProp ?? screen.height;
  const [layers] = useState(() =>
    LAYERS.map((layer) => makeStars(layer, width, height))
  );

  const t0 = useSharedValue(MIN_OPACITY);
  const t1 = useSharedValue(MIN_OPACITY);
  const t2 = useSharedValue(MIN_OPACITY);
  const opacities = [t0, t1, t2];

  useEffect(() => {
    const pulse = (dur: number) =>
      withRepeat(
        withTiming(1, { duration: dur, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    t0.value = withDelay(LAYER_DELAYS[0], pulse(LAYER_DURATIONS[0]));
    t1.value = withDelay(LAYER_DELAYS[1], pulse(LAYER_DURATIONS[1]));
    t2.value = withDelay(LAYER_DELAYS[2], pulse(LAYER_DURATIONS[2]));
  }, [t0, t1, t2]);

  return (
    <View pointerEvents="none" style={tw`absolute inset-0`}>
      {LAYERS.map((layer) => (
        <StarLayer
          key={layer}
          stars={layers[layer]}
          opacity={opacities[layer]}
          color={color}
        />
      ))}
    </View>
  );
}

export default memo(TwinkleStars);
