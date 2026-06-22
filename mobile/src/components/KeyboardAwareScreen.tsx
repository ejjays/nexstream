import { type ComponentProps } from 'react';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import tw from '../lib/tw';

type Props = ComponentProps<typeof KeyboardAwareScrollView>;

/* bottomOffset + persistTaps are the tuned smoothness */
export default function KeyboardAwareScreen({
  children,
  bottomOffset = 24,
  ...rest
}: Props) {
  return (
    <KeyboardAwareScrollView
      style={tw`flex-1`}
      keyboardShouldPersistTaps="handled"
      bottomOffset={bottomOffset}
      {...rest}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
