import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Home, Settings, BookOpen } from 'lucide-react-native';
import tw from '../lib/tw';
import SettingsModal from './SettingsModal';

type Tab = 'home' | 'settings' | 'docs';

const TABS = [
  { id: 'home' as Tab, label: 'Home', Icon: Home },
  { id: 'settings' as Tab, label: 'Settings', Icon: Settings },
  { id: 'docs' as Tab, label: 'Docs', Icon: BookOpen },
];

export default function BottomNav() {
  const [active, setActive] = useState<Tab>('home');
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <View
      style={[
        tw`mb-3 flex-row items-center justify-center gap-8 self-center rounded-3xl border border-white/10 bg-surface px-7 py-3`,
        {
          shadowColor: '#000',
          shadowOpacity: 0.5,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 16,
        },
      ]}
    >
      {TABS.map(({ id, label, Icon }) => {
        const color = id === active ? '#22d3ee' : '#64748b';
        return (
          <TouchableOpacity
            key={id}
            activeOpacity={0.7}
            onPress={() => {
              if (id === 'settings') setSettingsOpen(true);
              else setActive(id);
            }}
            style={tw`items-center`}
          >
            <Icon size={24} color={color} />
            <Text style={[tw`mt-1 text-[10px] font-mono-semibold`, { color }]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </View>
  );
}
