import { Pressable, Text } from 'react-native';
import tw from '../../lib/tw';
import ImageSheet from './ImageSheet';
import tree from '../../../assets/tree.jpg';
import { tapImpact, tapSelection } from '../../lib/haptics';

type Props = {
  visible: boolean;
  onAllow: () => void;
  onDismiss: () => void;
};

export default function NotificationPermissionSheet({
  visible,
  onAllow,
  onDismiss,
}: Props) {
  return (
    <ImageSheet visible={visible} onClose={onDismiss} image={tree}>
      <Text
        style={tw`text-center text-[28px] leading-9 font-sans-bold text-white`}
      >
        Allow NexStream to notify you about downloads!
      </Text>
      <Text
        style={tw`mt-3 text-center text-[15px] leading-6 font-sans text-slate-300`}
      >
        Stay updated on your downloads and tap any alert to open it instantly
      </Text>

      <Pressable
        onPress={() => {
          tapImpact();
          onAllow();
        }}
        accessibilityRole="button"
        accessibilityLabel="Allow notifications"
        style={({ pressed }) => [
          tw`mt-8 w-full items-center justify-center rounded-full bg-white py-4`,
          pressed && tw`opacity-90`,
        ]}
      >
        <Text style={tw`text-[17px] font-sans-semibold text-[#0a1224]`}>
          Allow
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          tapSelection();
          onDismiss();
        }}
        accessibilityRole="button"
        accessibilityLabel="Not now"
        style={({ pressed }) => [
          tw`mt-1 w-full items-center justify-center py-4`,
          pressed && tw`opacity-60`,
        ]}
      >
        <Text style={tw`text-[16px] font-sans-medium text-white/70`}>
          Not now
        </Text>
      </Pressable>
    </ImageSheet>
  );
}
