import { Text, View } from 'react-native';
import { FireIcon, ThumbsUpIcon, TwoToneHeartIcon } from './icons';

export default function ReactionEmoji({
  emoji,
  size,
}: {
  emoji: string;
  size: number;
}) {
  let glyph;
  if (emoji === '🔥') glyph = <FireIcon size={size} />;
  else if (emoji === '👍') glyph = <ThumbsUpIcon size={size} />;
  else if (emoji === '❤️') glyph = <TwoToneHeartIcon size={size} />;
  else
    glyph = (
      <View
        style={{
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: size, lineHeight: size * 1.1 }}>
          {emoji}
        </Text>
      </View>
    );
  return <View style={{ paddingVertical: 1.5 }}>{glyph}</View>;
}
