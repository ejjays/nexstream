import { memo, useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useScreenSize } from '../../hooks/useScreenSize';
import tw from '../../lib/tw';

const STAR_COLOR = '#22d3ee';
const STAR_WIDTH = 20;
const SPEED_FACTOR = 2.6;
const STAR_IDS = ['a', 'b', 'c', 'd'];

function makeConfig(width: number, height: number) {
  const fromTop = Math.random() > 0.5;
  const angleDeg = 45 + (Math.random() * 10 - 5);
  const rad = (angleDeg * Math.PI) / 180;
  const speed = 3 + Math.random() * 5;
  const maxLife = 120 + Math.random() * 80;
  const tailLen = STAR_WIDTH * (2 + speed / 5);
  const lineSize = 1 + Math.random() * 0.5;
  return {
    startX: fromTop ? Math.random() * width : -tailLen,
    startY: fromTop ? -tailLen : Math.random() * height,
    dirX: Math.cos(rad),
    dirY: Math.sin(rad),
    angleDeg,
    travel: speed * maxLife,
    dur: ((maxLife / 60) * 1000) / SPEED_FACTOR,
    fadeIn: 15 / maxLife,
    fadeOut: (maxLife - 30) / maxLife,
    tailLen,
    lineSize,
    headSize: lineSize * 1.8,
    gap: 1400 + Math.random() * 2800,
  };
}

function Star({
  index,
  width,
  height,
}: {
  index: number;
  width: number;
  height: number;
}) {
  const progress = useSharedValue(0);
  const [cfg] = useState(() => makeConfig(width, height));
  const rotateStr = `${cfg.angleDeg}deg`;

  useEffect(() => {
    const initial = index * 600 + Math.random() * 1500;
    progress.value = withDelay(
      initial,
      withRepeat(
        withSequence(
          withTiming(0, { duration: 0 }),
          withDelay(
            cfg.gap,
            withTiming(1, { duration: cfg.dur, easing: Easing.linear })
          )
        ),
        -1
      )
    );
  }, [progress, cfg, index]);

  const style = useAnimatedStyle(() => {
    const value = progress.value;
    return {
      opacity: interpolate(
        value,
        [0, cfg.fadeIn, cfg.fadeOut, 1],
        [0, 1, 1, 0]
      ),
      transform: [
        { translateX: cfg.startX + value * cfg.travel * cfg.dirX },
        { translateY: cfg.startY + value * cfg.travel * cfg.dirY },
        { rotate: rotateStr },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        { position: 'absolute', width: cfg.tailLen, height: cfg.lineSize },
        style,
      ]}
    >
      <LinearGradient
        colors={['transparent', STAR_COLOR]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ flex: 1, borderRadius: cfg.lineSize / 2 }}
      />
      <View
        style={{
          position: 'absolute',
          right: -cfg.headSize / 2,
          top: (cfg.lineSize - cfg.headSize) / 2,
          width: cfg.headSize,
          height: cfg.headSize,
          borderRadius: cfg.headSize / 2,
          backgroundColor: STAR_COLOR,
          boxShadow: '0px 0px 4px 0px rgba(34, 211, 238, 0.9)',
        }}
      />
    </Animated.View>
  );
}

function ShootingStars({ count = 4 }: { count?: number }) {
  const { width, height } = useScreenSize();
  return (
    <View pointerEvents="none" style={tw`absolute inset-0 overflow-hidden`}>
      {STAR_IDS.slice(0, count).map((id, index) => (
        <Star key={id} index={index} width={width} height={height} />
      ))}
    </View>
  );
}

export default memo(ShootingStars);
