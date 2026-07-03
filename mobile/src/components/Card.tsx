import type { ReactNode } from 'react';
import { View } from 'react-native';
import tw from '../lib/tw';

export default function Card({ children }: { children: ReactNode }) {
  return (
    <View
      style={tw`overflow-hidden rounded-3xl border border-white/10 bg-white/5`}
    >
      {children}
    </View>
  );
}
