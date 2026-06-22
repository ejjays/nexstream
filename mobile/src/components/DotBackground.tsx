import { View } from 'react-native';
import Svg, { Defs, Pattern, Circle, Rect } from 'react-native-svg';
import tw from '../lib/tw';

export default function DotBackground() {
  return (
    <View pointerEvents="none" style={tw`absolute inset-0`}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern
            id="dots"
            width={24}
            height={24}
            patternUnits="userSpaceOnUse"
          >
            <Circle cx={2} cy={2} r={1} fill="#808080" fillOpacity={0.5} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#dots)" />
      </Svg>
    </View>
  );
}
