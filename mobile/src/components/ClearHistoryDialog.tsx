import { Pressable, Text, View, Modal, StyleSheet } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import tw from '../lib/tw';
import { tapImpact, tapSelection } from '../lib/haptics';

type Props = {
  open: boolean;
  count: number;
  onClose: () => void;
  onConfirm: () => void;
};

const buttonGlow = {
  shadowColor: '#06b6d4',
  shadowOpacity: 0.5,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 0 },
  elevation: 10,
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0a1224',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
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
            tw`w-full max-w-[340px] items-center rounded-3xl border border-primary/30 px-6 py-7`,
            styles.card,
          ]}
          onPress={() => undefined}
        >
          <View
            style={tw`items-center justify-center rounded-full border border-primary/40 bg-primary/10 p-3.5`}
          >
            <AlertTriangle size={26} color="#22d3ee" />
          </View>
          <Text
            style={tw`mt-4 text-center text-[20px] font-sans-bold text-white`}
          >
            Clear history?
          </Text>
          <Text
            style={tw`mt-2 text-center text-[14px] leading-6 font-sans text-slate-300`}
          >
            Remove {count} {count === 1 ? 'item' : 'items'} from the list. Your
            saved files stay in the gallery.
          </Text>

          <View style={tw`mt-6 w-full gap-2.5`}>
            <Pressable
              onPress={() => {
                tapImpact();
                onConfirm();
              }}
              accessibilityRole="button"
              accessibilityLabel="Clear history"
              style={({ pressed }) => [
                tw`w-full items-center justify-center rounded-full border border-primary/40 py-3.5`,
                { backgroundColor: '#22d3ee40' },
                buttonGlow,
                pressed && tw`opacity-90`,
              ]}
            >
              <Text
                style={[
                  tw`text-[16px] font-sans-semibold`,
                  { color: '#22d3ee' },
                ]}
              >
                Clear {count === 1 ? 'item' : 'all'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                tapSelection();
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={({ pressed }) => [
                tw`w-full items-center justify-center rounded-full py-3.5`,
                pressed && tw`opacity-60`,
              ]}
            >
              <Text style={tw`text-[15px] font-sans-medium text-white/70`}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
