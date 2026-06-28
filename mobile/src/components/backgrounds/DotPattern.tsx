import { memo, useEffect, useMemo, useRef } from 'react';
import { View, type GestureResponderEvent } from 'react-native';
import { KeyboardEvents } from 'react-native-keyboard-controller';
import {
  Canvas,
  Picture,
  createPicture,
  Skia,
  TileMode,
} from '@shopify/react-native-skia';
import {
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useScreenSize } from '../../hooks/useScreenSize';
import tw from '../../lib/tw';

const GAP = 24;
const DOT = 2;
const CELL = DOT + GAP;
const BASE_R = DOT / 2;
const PROX = 100;
const PROX_SQ = PROX * PROX;

type Dot = { x: number; y: number };

export function useDotTouch() {
  const touchX = useSharedValue(-1000);
  const touchY = useSharedValue(-1000);
  const active = useSharedValue(0);
  const kbOpen = useRef(false);
  useEffect(() => {
    const onShow = () => {
      kbOpen.current = true;
      active.value = 0;
    };
    const onHide = () => {
      kbOpen.current = false;
    };
    const showSub = KeyboardEvents.addListener('keyboardWillShow', onShow);
    const hideSub = KeyboardEvents.addListener('keyboardWillHide', onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [active]);
  const startRef = useRef({ x: 0, y: 0, dragging: false });
  const onTouchStart = (event: GestureResponderEvent) => {
    const { pageX, pageY } = event.nativeEvent;
    startRef.current = { x: pageX, y: pageY, dragging: false };
    touchX.value = pageX;
    touchY.value = pageY;
  };
  const onTouchMove = (event: GestureResponderEvent) => {
    if (kbOpen.current) return;
    const { pageX, pageY } = event.nativeEvent;
    touchX.value = pageX;
    touchY.value = pageY;
    if (!startRef.current.dragging) {
      const dx = pageX - startRef.current.x;
      const dy = pageY - startRef.current.y;
      if (dx * dx + dy * dy < 144) return;
      startRef.current.dragging = true;
    }
    active.value = 1;
  };
  const release = () => {
    active.value = withTiming(0, { duration: 900 });
  };
  return {
    touchX,
    touchY,
    active,
    touchHandlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd: release,
      onTouchCancel: release,
    },
  };
}

function DotPattern({
  touchX,
  touchY,
  active,
}: {
  touchX: SharedValue<number>;
  touchY: SharedValue<number>;
  active: SharedValue<number>;
}) {
  const { width, height } = useScreenSize();

  const grid = useMemo(() => {
    const cols = Math.ceil(width / CELL) + 1;
    const rows = Math.ceil(height / CELL) + 1;
    const offsetX = (width - (cols - 1) * CELL) / 2;
    const offsetY = (height - (rows - 1) * CELL) / 2;
    const dots: Dot[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        dots.push({ x: offsetX + col * CELL, y: offsetY + row * CELL });
      }
    }
    return { dots, cols, rows, offsetX, offsetY };
  }, [width, height]);

  const grayPicture = useMemo(
    () =>
      createPicture((canvas) => {
        const paint = Skia.Paint();
        paint.setColor(Skia.Color('rgba(128,128,128,0.5)'));
        const all = grid.dots;
        for (let idx = 0; idx < all.length; idx++) {
          canvas.drawCircle(all[idx].x, all[idx].y, BASE_R, paint);
        }
      }),
    [grid]
  );

  const glowPicture = useDerivedValue(() =>
    createPicture((canvas) => {
      const act = active.value;
      if (act <= 0) return;
      const tchX = touchX.value;
      const tchY = touchY.value;
      const { dots, cols, rows, offsetX, offsetY } = grid;
      const paint = Skia.Paint();
      paint.setShader(
        Skia.Shader.MakeRadialGradient(
          Skia.Point(tchX, tchY),
          PROX,
          [
            Skia.Color(`rgba(34,211,238,${act * 0.16})`),
            Skia.Color(`rgba(34,211,238,${act * 0.06})`),
            Skia.Color('rgba(34,211,238,0)'),
          ],
          [0, 0.4, 1],
          TileMode.Clamp
        )
      );
      canvas.drawCircle(tchX, tchY, PROX, paint);
      paint.setShader(null);
      const colMin = Math.max(0, Math.floor((tchX - PROX - offsetX) / CELL));
      const colMax = Math.min(
        cols - 1,
        Math.ceil((tchX + PROX - offsetX) / CELL)
      );
      const rowMin = Math.max(0, Math.floor((tchY - PROX - offsetY) / CELL));
      const rowMax = Math.min(
        rows - 1,
        Math.ceil((tchY + PROX - offsetY) / CELL)
      );
      for (let row = rowMin; row <= rowMax; row++) {
        for (let col = colMin; col <= colMax; col++) {
          const dot = dots[row * cols + col];
          if (!dot) continue;
          const dx = dot.x - tchX;
          const dy = dot.y - tchY;
          const distSq = dx * dx + dy * dy;
          if (distSq >= PROX_SQ) continue;
          const ratio = (1 - Math.sqrt(distSq) / PROX) * act;
          const eased = ratio * ratio * (3 - 2 * ratio);
          if (eased <= 0.02) continue;
          const glowR = 5 + eased * 8;
          paint.setShader(
            Skia.Shader.MakeRadialGradient(
              Skia.Point(dot.x, dot.y),
              glowR,
              [
                Skia.Color(`rgba(34,211,238,${eased * 0.28})`),
                Skia.Color(`rgba(34,211,238,${eased * 0.08})`),
                Skia.Color('rgba(34,211,238,0)'),
              ],
              [0, 0.5, 1],
              TileMode.Clamp
            )
          );
          canvas.drawCircle(dot.x, dot.y, glowR, paint);
          paint.setShader(null);
          const red = Math.round(128 + (34 - 128) * eased);
          const green = Math.round(128 + (211 - 128) * eased);
          const blue = Math.round(128 + (238 - 128) * eased);
          paint.setColor(
            Skia.Color(
              `rgba(${red},${green},${blue},${Math.min(1, 0.5 + eased * 0.5)})`
            )
          );
          canvas.drawCircle(dot.x, dot.y, BASE_R + eased * 0.8, paint);
        }
      }
    })
  );

  const vignettePicture = useMemo(
    () =>
      createPicture((canvas) => {
        const cx = width / 2;
        const cy = height / 2;
        const localMatrix = Skia.Matrix();
        localMatrix.translate(cx, cy);
        localMatrix.scale(cx, cy);
        const paint = Skia.Paint();
        paint.setShader(
          Skia.Shader.MakeRadialGradient(
            Skia.Point(0, 0),
            1,
            [
              Skia.Color('rgba(3,0,20,0)'),
              Skia.Color('rgba(3,0,20,0)'),
              Skia.Color('rgba(3,0,20,0.06)'),
              Skia.Color('rgba(3,0,20,0.2)'),
              Skia.Color('rgba(3,0,20,0.5)'),
            ],
            [0, 0.35, 0.6, 0.85, 1],
            TileMode.Clamp,
            localMatrix
          )
        );
        canvas.drawRect(Skia.XYWHRect(0, 0, width, height), paint);
      }),
    [width, height]
  );

  return (
    <View pointerEvents="none" style={tw`absolute inset-0`}>
      <Canvas style={tw`flex-1`}>
        <Picture picture={grayPicture} />
        <Picture picture={glowPicture} />
        <Picture picture={vignettePicture} />
      </Canvas>
    </View>
  );
}

export default memo(DotPattern);
