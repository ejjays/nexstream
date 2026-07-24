import { Pressable, Text, View, Modal, StyleSheet } from 'react-native';
import tw from '../lib/tw';
import { tapImpact, tapSelection } from '../lib/haptics';

type Props = {
  open: boolean;
  count: number;
  onClose: () => void;
  onConfirm: () => void;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0f172a',
  },
});

export default function ClearHistoryDialog({
  open,
  count,
  onClose,
  onConfirm,
}: Props) {
  if (!open) return null;
  return (
    <Modal visible transparent statusBarTranslucent animationType="fade">
      <Pressable
        style={tw`flex-1 items-center justify-center bg-black/60 px-8`}
        onPress={onClose}
        accessibilityLabel="Close"
      >
        <Pressable
          style={[
            tw`w-full max-w-[340px] items-center rounded-3xl border border-white/10 px-6 py-7`,
            styles.card,
          ]}
          onPress={() => undefined}
        >
          <Text style={tw`text-[20px] font-sans-bold text-white mb-2`}>
            Clear history?
          </Text>

          <Text style={tw`text-center text-[14px] leading-6 font-sans text-slate-300 mb-8`}>
            Remove {count} {count === 1 ? 'item' : 'items'} from the list. Your
            saved files stay in the gallery.
          </Text>

          <View style={tw`w-full flex-row gap-3`}>
            <Pressable
              onPress={() => {
                tapSelection();
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={({ pressed }) => [
                tw`flex-1 items-center justify-center rounded-2xl bg-slate-800 py-3.5`,
                pressed && tw`opacity-70`,
              ]}
            >
              <Text style={tw`text-[17px] font-sans-semibold text-white`}>
                Cancel
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                tapImpact();
                onConfirm();
              }}
              accessibilityRole="button"
              accessibilityLabel="Delete"
              style={({ pressed }) => [
                tw`flex-1 items-center justify-center rounded-2xl bg-red-500/10 py-3.5`,
                pressed && tw`opacity-70`,
              ]}
            >
              <Text style={tw`text-[17px] font-sans-semibold text-red-500`}>
                Clear {count === 1 ? 'item' : 'all'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
