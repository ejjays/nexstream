import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Canvas,
  Picture,
  createPicture,
  Skia,
  PaintStyle,
  TileMode,
} from '@shopify/react-native-skia';
import tw from '../lib/tw';

const GAP = 28;
const LINE = 'rgba(38,38,69,0.55)';

export default function GridBackground({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const picture = useMemo(
    () =>
      createPicture((canvas) => {
        const line = Skia.Paint();
        line.setStyle(PaintStyle.Stroke);
        line.setStrokeWidth(1);
        line.setColor(Skia.Color(LINE));
        for (let x = 0; x <= width; x += GAP) {
          canvas.drawLine(x, 0, x, height, line);
        }
        for (let y = 0; y <= height; y += GAP) {
          canvas.drawLine(0, y, width, y, line);
        }

        const cx = width / 2;
        const cy = height / 2;
        const localMatrix = Skia.Matrix();
        localMatrix.translate(cx, cy);
        localMatrix.scale(cx, cy);
        const fade = Skia.Paint();
        fade.setShader(
          Skia.Shader.MakeRadialGradient(
            Skia.Point(0, 0),
            1,
            [
              Skia.Color('rgba(10,18,36,0)'),
              Skia.Color('rgba(10,18,36,0)'),
              Skia.Color('rgba(10,18,36,0.6)'),
            ],
            [0, 0.7, 1],
            TileMode.Clamp,
            localMatrix
          )
        );
        canvas.drawRect(Skia.XYWHRect(0, 0, width, height), fade);

        const bottom = Skia.Paint();
        bottom.setShader(
          Skia.Shader.MakeLinearGradient(
            Skia.Point(0, 0),
            Skia.Point(0, height),
            [
              Skia.Color('rgba(10,18,36,0)'),
              Skia.Color('rgba(10,18,36,0)'),
              Skia.Color('rgba(10,18,36,0.92)'),
            ],
            [0, 0.45, 0.82],
            TileMode.Clamp
          )
        );
        canvas.drawRect(Skia.XYWHRect(0, 0, width, height), bottom);
      }),
    [width, height]
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={tw`flex-1`}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
}
