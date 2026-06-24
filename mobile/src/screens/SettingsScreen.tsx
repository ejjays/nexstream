import { memo, useEffect, useState, type ComponentType } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Linking,
  AppState,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { ChevronRight, Check } from 'lucide-react-native';
import { tapSelection, setHapticsEnabled } from '../lib/haptics';
import { cacheSize, clearCache, formatBytes } from '../lib/diskcache';
import tw from '../lib/tw';
import BottomSheet from '../components/BottomSheet';
import {
  FolderIcon,
  FileIcon,
  PasteIcon,
  NotificationIcon,
  HapticsIcon,
  BatteryIcon,
  ClearCacheIcon,
  PrivacyIcon,
  GitIcon,
  VersionIcon,
} from '../components/icons';
import { readSaveDir, pickSaveDir, fullPath } from '../lib/save';
import {
  getFilenameFormat,
  setFilenameFormat,
  getAutoPaste,
  setAutoPaste,
  getNotify,
  setNotify,
  getHaptics,
  setHaptics,
  formatName,
  type FilenameFormat,
} from '../lib/settings';
import { enableNotifications } from '../lib/notify';
import {
  isBatteryRestricted,
  requestIgnoreBatteryOptimization,
} from '../lib/fgservice';

const CYAN = '#22d3ee';

const FORMAT_ORDER: FilenameFormat[] = [
  'artist-title',
  'title',
  'title-platform',
];
const FORMAT_LABELS: Record<FilenameFormat, string> = {
  'artist-title': 'Artist – Title',
  title: 'Title only',
  'title-platform': 'Title (platform)',
};

type IconType = ComponentType<{ size?: number; color?: string }>;

function Toggle({ value }: { value: boolean }) {
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(value ? 20 : 0, { duration: 170 }) }],
  }));
  return (
    <View
      style={[
        tw`h-7 w-12 justify-center rounded-full px-0.5`,
        value ? tw`bg-primary` : tw`bg-slate-700`,
      ]}
    >
      <Animated.View style={[tw`h-6 w-6 rounded-full bg-white`, knobStyle]} />
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={tw`mb-3 ml-1 mt-8 font-sans-semibold text-[13px] text-slate-500`}
    >
      {children}
    </Text>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={tw`overflow-hidden rounded-3xl border border-white/10 bg-white/5`}
    >
      {children}
    </View>
  );
}

function RowShell({
  Icon,
  label,
  hint,
  last,
  tile = true,
  iconSize,
  children,
}: {
  Icon: IconType;
  label: string;
  hint?: string;
  last?: boolean;
  tile?: boolean;
  iconSize?: number;
  children: React.ReactNode;
}) {
  return (
    <View style={tw`flex-row items-center pl-4`}>
      <View
        style={[
          tw`h-10 w-10 items-center justify-center rounded-2xl`,
          tile && tw`bg-primary/15`,
        ]}
      >
        <Icon size={iconSize ?? (tile ? 19 : 28)} color={CYAN} />
      </View>
      <View
        style={[
          tw`ml-3.5 flex-1 flex-row items-center py-4 pr-4`,
          !last && tw`border-b border-white/5`,
        ]}
      >
        <View style={tw`flex-1`}>
          <Text style={tw`font-sans-semibold text-[15px] text-white`}>
            {label}
          </Text>
          {hint ? (
            <Text style={tw`mt-0.5 font-sans text-[12px] text-slate-500`}>
              {hint}
            </Text>
          ) : null}
        </View>
        {children}
      </View>
    </View>
  );
}

function ToggleRow(props: {
  Icon: IconType;
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  last?: boolean;
  tile?: boolean;
  iconSize?: number;
}) {
  const { value, onValueChange, ...rest } = props;
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      android_ripple={{ color: 'rgba(255,255,255,0.03)' }}
    >
      <RowShell {...rest}>
        <Toggle value={value} />
      </RowShell>
    </Pressable>
  );
}

function ValueLabel({
  value,
  tone,
}: {
  value: string;
  tone?: 'good' | 'warn';
}) {
  if (!tone) {
    return (
      <Text
        numberOfLines={1}
        style={tw`mr-2 max-w-[150px] font-sans-medium text-[13px] text-slate-400`}
      >
        {value}
      </Text>
    );
  }
  return (
    <View
      style={[
        tw`mr-2 rounded-full px-2.5 py-1`,
        tone === 'good' ? tw`bg-green-500/15` : tw`bg-amber-500/15`,
      ]}
    >
      <Text
        style={[
          tw`font-sans-semibold text-[12px]`,
          tone === 'good' ? tw`text-green-400` : tw`text-amber-400`,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function LinkRow(props: {
  Icon: IconType;
  label: string;
  hint?: string;
  value?: string;
  tone?: 'good' | 'warn';
  last?: boolean;
  onPress?: () => void;
  tile?: boolean;
  iconSize?: number;
}) {
  const { value, onPress, tone, ...rest } = props;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: 'rgba(255,255,255,0.03)' }}
    >
      <RowShell {...rest}>
        {value ? <ValueLabel value={value} tone={tone} /> : null}
        <ChevronRight size={18} color="#475569" />
      </RowShell>
    </Pressable>
  );
}

function SettingsScreen({ visible }: { visible: boolean }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, { duration: 160 });
  }, [visible, progress]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const [dir, setDir] = useState<string | null>(null);
  const [format, setFormat] = useState<FilenameFormat>('artist-title');
  const [autopaste, setAutopaste] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [notifs, setNotifs] = useState(false);
  const [hapticsOn, setHapticsOn] = useState(true);
  const [cacheBytes, setCacheBytes] = useState(0);
  const [batteryRestricted, setBatteryRestricted] = useState<boolean | null>(
    null
  );

  useEffect(() => {
    readSaveDir().then(setDir);
    getFilenameFormat().then(setFormat);
    getAutoPaste().then(setAutopaste);
    getNotify().then(setNotifs);
    getHaptics().then(setHapticsOn);
    setCacheBytes(cacheSize());
  }, []);

  useEffect(() => {
    const check = () => {
      isBatteryRestricted()
        .then(setBatteryRestricted)
        .catch(() => undefined);
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, []);

  const pickDir = () => {
    pickSaveDir().then((picked) => {
      if (picked) setDir(picked);
    });
  };

  const choose = (f: FilenameFormat) => {
    tapSelection();
    setFormat(f);
    setFilenameFormat(f);
    setTimeout(() => setPickerOpen(false), 150);
  };

  const toggleAutopaste = (v: boolean) => {
    setAutopaste(v);
    setAutoPaste(v);
  };

  const toggleNotify = (v: boolean) => {
    if (!v) {
      setNotifs(false);
      setNotify(false);
      return;
    }
    enableNotifications().then(setNotifs);
  };

  const toggleHaptics = (v: boolean) => {
    setHapticsOn(v);
    setHaptics(v);
    setHapticsEnabled(v);
    if (v) tapSelection();
  };

  const clearAppCache = () => {
    tapSelection();
    clearCache();
    setCacheBytes(0);
  };

  const openBattery = () => {
    tapSelection();
    requestIgnoreBatteryOptimization().catch(() => undefined);
  };

  const openSourceCode = () => {
    tapSelection();
    Linking.openURL('https://github.com/ejjays/nexstream').catch(
      () => undefined
    );
  };

  return (
    // skipcq: JS-0415
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, tw`bg-background`, fadeStyle]}
    >
      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={tw`items-center px-5 pb-36 pt-16`}
        showsVerticalScrollIndicator={false}
      >
        <View style={[tw`w-full`, { maxWidth: 600 }]}>
          <Text
            style={tw`font-sans-bold text-[32px] tracking-tight text-white`}
          >
            Settings
          </Text>

          <SectionLabel>Downloads</SectionLabel>
          <Card>
            <LinkRow
              Icon={FolderIcon}
              label="Save location"
              hint={dir ? fullPath(dir) : 'Tap to choose a folder'}
              onPress={pickDir}
              tile={false}
              iconSize={26}
            />
            <LinkRow
              Icon={FileIcon}
              label="Filename format"
              hint={`${formatName(format, 'Best video', 'MrBeast', 'youtube')}.mp4`}
              onPress={() => setPickerOpen(true)}
              tile={false}
              iconSize={26}
            />
            <ToggleRow
              Icon={PasteIcon}
              label="Auto-detect clipboard"
              hint="Fill copied link when you return"
              value={autopaste}
              onValueChange={toggleAutopaste}
              last
              tile={false}
              iconSize={26}
            />
          </Card>

          <SectionLabel>App</SectionLabel>
          <Card>
            <ToggleRow
              Icon={NotificationIcon}
              label="Notifications"
              hint="Alert when download finishes"
              value={notifs}
              onValueChange={toggleNotify}
              tile={false}
              iconSize={26}
            />
            <ToggleRow
              Icon={HapticsIcon}
              label="Haptics"
              hint="Vibrate on taps and actions"
              value={hapticsOn}
              onValueChange={toggleHaptics}
              tile={false}
              iconSize={27}
            />
            <LinkRow
              Icon={BatteryIcon}
              label="Battery optimization"
              hint={
                batteryRestricted === false
                  ? 'Allowed to run without limits'
                  : 'Stop Android pausing long downloads'
              }
              value={batteryRestricted === false ? 'Off' : 'Fix'}
              tone={batteryRestricted === false ? 'good' : 'warn'}
              onPress={openBattery}
              tile={false}
            />
            <LinkRow
              Icon={ClearCacheIcon}
              label="Clear cache"
              value={cacheBytes > 0 ? formatBytes(cacheBytes) : 'Empty'}
              onPress={clearAppCache}
              tile={false}
              last
              iconSize={26}
            />
          </Card>

          <SectionLabel>About</SectionLabel>
          <Card>
            <LinkRow
              Icon={PrivacyIcon}
              label="Privacy"
              hint="Everything runs on your device"
              tile={false}
              iconSize={26}
            />
            <LinkRow
              Icon={GitIcon}
              label="Source code"
              value="GitHub"
              onPress={openSourceCode}
              tile={false}
              iconSize={26}
            />
            <LinkRow
              Icon={VersionIcon}
              label="Version"
              value="1.0.0"
              tile={false}
              last
              iconSize={24}
            />
          </Card>
        </View>
      </ScrollView>

      <BottomSheet open={pickerOpen} onClose={() => setPickerOpen(false)}>
        <View style={tw`mb-4 flex-row items-center px-1`}>
          <View style={tw`flex-1`}>
            <Text
              style={tw`font-sans-bold text-[22px] tracking-tight text-white`}
            >
              Filename format
            </Text>
            <Text style={tw`mt-1 font-sans text-[13px] text-slate-400`}>
              How your saved files are named
            </Text>
          </View>
          <FileIcon size={40} />
        </View>
        <View style={tw`rounded-[28px] bg-[#151d33] p-3.5`}>
          {FORMAT_ORDER.map((f, i) => {
            const active = f === format;
            const last = i === FORMAT_ORDER.length - 1;
            return (
              <Pressable
                key={f}
                onPress={() => choose(f)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [
                  tw`flex-row items-center rounded-full border px-5 py-3.5`,
                  last ? null : tw`mb-2.5`,
                  active ? tw`border-primary` : tw`border-white/15`,
                  pressed ? { transform: [{ scale: 0.985 }] } : null,
                ]}
              >
                <View style={tw`flex-1`}>
                  <View
                    style={[
                      tw`self-start rounded-full px-2 py-0.5`,
                      { backgroundColor: CYAN },
                    ]}
                  >
                    <Text
                      style={[
                        tw`font-sans-semibold text-[14px]`,
                        { color: '#000000' },
                      ]}
                    >
                      {FORMAT_LABELS[f]}
                    </Text>
                  </View>
                  <Text
                    style={tw`mt-1.5 ml-1 font-mono text-[10.5px] text-white`}
                  >
                    {formatName(f, 'Best video', 'MrBeast', 'youtube')}.mp4
                  </Text>
                </View>
                <View
                  style={[
                    tw`ml-3 h-6 w-6 items-center justify-center rounded-full`,
                    active ? tw`bg-primary` : tw`border-2 border-white/20`,
                  ]}
                >
                  {active ? (
                    <Check size={14} color="#030014" strokeWidth={3} />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </Animated.View>
  );
}

export default memo(SettingsScreen);
