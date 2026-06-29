import { memo, useEffect, useState, type ComponentType } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Linking,
  AppState,
  BackHandler,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, ChevronLeft, Check, Lock } from 'lucide-react-native';
import { tapSelection, tapSuccess, setHapticsEnabled } from '../lib/haptics';
import { cacheSize, clearCache, formatBytes } from '../lib/diskcache';
import tw from '../lib/tw';
import BottomSheet from '../components/sheets/BottomSheet';
import Avatar from '../components/Avatar';
import KeyboardAvoidingForm from '../components/KeyboardAvoidingForm';
import LottieView from 'lottie-react-native';
import filenameAnim from '../../assets/filename.json';
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
  GoogleIcon,
} from '../components/icons';
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
import {
  isSupabaseConfigured,
  getAccount,
  changeUsername,
  onAuthChange,
  validateUsername,
  suggestUsernameFrom,
  syncProfileAvatar,
  messageOf,
  type Account,
} from '../lib/social/updates';
import { signInWithGoogle, signOutGoogle } from '../lib/social/googleAuth';

const CYAN = '#22d3ee';
const buttonGlow = {
  shadowColor: '#06b6d4',
  shadowOpacity: 0.5,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 0 },
  elevation: 10,
};

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

function AccountSkeleton() {
  const pulse = useSharedValue(0.4);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.9, { duration: 1000 }), -1, true);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Card>
      <Animated.View style={[tw`flex-row items-center p-4`, pulseStyle]}>
        <View
          style={[tw`bg-white/10`, { width: 52, height: 52, borderRadius: 26 }]}
        />
        <View style={tw`ml-3.5 flex-1`}>
          <View style={tw`h-3.5 w-32 rounded-full bg-white/10`} />
          <View style={tw`mt-2.5 h-2.5 w-44 rounded-full bg-white/5`} />
        </View>
      </Animated.View>
    </Card>
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

function AccountRow({
  label,
  value,
  onPress,
  last,
  locked,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  last?: boolean;
  locked?: boolean;
}) {
  const row = (
    <View
      style={[
        tw`flex-row items-center justify-between px-5 py-4`,
        last ? null : tw`border-b border-white/5`,
      ]}
    >
      <View style={tw`flex-row items-center`}>
        <Text style={tw`font-sans text-[14px] text-slate-400`}>{label}</Text>
        {locked ? (
          <View style={tw`ml-1.5`}>
            <Lock size={13} color="#64748b" strokeWidth={2.2} />
          </View>
        ) : null}
      </View>
      <Text
        numberOfLines={1}
        style={tw`ml-4 flex-1 text-right font-sans-medium text-[15px] text-white`}
      >
        {value}
      </Text>
    </View>
  );
  if (!onPress) return row;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: 'rgba(255,255,255,0.03)' }}
    >
      {row}
    </Pressable>
  );
}

function AccountPage({
  account,
  nameValue,
  onChangeName,
  onSave,
  saving,
  error,
  onBack,
  onSignOut,
}: {
  account: Account | null;
  nameValue: string;
  onChangeName: (value: string) => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onSignOut: () => void;
}) {
  const changed = nameValue.trim() !== (account?.username ?? '');
  const canSave = changed && validateUsername(nameValue).ok && !saving;
  return (
    <KeyboardAvoidingForm contentContainerStyle={tw`px-5 pb-36 pt-14`}>
      <View style={[tw`w-full self-center`, { maxWidth: 600 }]}>
        <View style={tw`h-10 flex-row items-center justify-center`}>
          <Pressable
            onPress={onBack}
            hitSlop={8}
            style={tw`absolute left-0 h-10 w-10 items-center justify-center rounded-full bg-white/10`}
          >
            <ChevronLeft size={22} color="#e2e8f0" strokeWidth={2.2} />
          </Pressable>
          <Text style={tw`font-sans-semibold text-[18px] text-white`}>
            Account
          </Text>
        </View>

        <View style={tw`mt-8 items-center`}>
          <Avatar
            name={account?.username ?? account?.name ?? 'G'}
            uri={account?.avatarUrl}
            size={112}
          />
        </View>

        <View style={tw`mt-9 overflow-hidden rounded-3xl bg-white/5`}>
          <AccountRow label="Name" value={account?.name ?? '—'} locked />
          <AccountRow label="Email" value={account?.email ?? '—'} locked />
          <View style={tw`flex-row items-center justify-between px-5 py-4`}>
            <Text style={tw`font-sans text-[14px] text-slate-400`}>
              Username
            </Text>
            <TextInput
              value={nameValue}
              onChangeText={onChangeName}
              onSubmitEditing={() => {
                if (canSave) onSave();
              }}
              placeholder="username"
              placeholderTextColor="#5b6472"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              selectionColor="#22d3ee"
              textAlign="right"
              style={tw`ml-4 flex-1 py-0 font-sans-medium text-[15px] text-white`}
            />
          </View>
        </View>
        {error ? (
          <Text style={tw`ml-1 mt-2 font-sans text-[12px] text-red-400`}>
            {error}
          </Text>
        ) : null}

        <Pressable
          onPress={onSave}
          disabled={!canSave}
          style={({ pressed }) => [
            tw`mt-7`,
            pressed && canSave ? { transform: [{ scale: 0.98 }] } : null,
          ]}
        >
          <LinearGradient
            colors={canSave ? ['#22d3ee', '#06b6d4'] : ['#1e293b', '#1e293b']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              tw`items-center rounded-full py-4`,
              canSave ? buttonGlow : null,
            ]}
          >
            <Text
              style={[
                tw`font-sans-bold text-[16px]`,
                { color: canSave ? '#04101f' : '#64748b' },
              ]}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </Text>
          </LinearGradient>
        </Pressable>

        <Pressable
          onPress={onSignOut}
          style={({ pressed }) => [
            tw`mt-3 items-center rounded-full border border-white/10 bg-white/5 py-4`,
            pressed ? { transform: [{ scale: 0.98 }] } : null,
          ]}
        >
          <Text style={tw`font-sans-semibold text-[16px] text-red-400`}>
            Log out
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingForm>
  );
}

function SettingsScreen({ visible }: { visible: boolean }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, { duration: 160 });
  }, [visible, progress]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const [format, setFormat] = useState<FilenameFormat>('artist-title');
  const [autopaste, setAutopaste] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [notifs, setNotifs] = useState(false);
  const [hapticsOn, setHapticsOn] = useState(true);
  const [cacheBytes, setCacheBytes] = useState(0);
  const [batteryRestricted, setBatteryRestricted] = useState<boolean | null>(
    null
  );
  const [account, setAccount] = useState<Account | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState('');
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountMounted, setAccountMounted] = useState(false);

  const accountProgress = useSharedValue(0);
  useEffect(() => {
    const opening = accountOpen;
    if (opening) setAccountMounted(true);
    accountProgress.value = withTiming(
      opening ? 1 : 0,
      { duration: 220 },
      (finished) => {
        if (finished && !opening) runOnJS(setAccountMounted)(false);
      }
    );
  }, [accountOpen, accountProgress]);
  const accountStyle = useAnimatedStyle(() => ({
    opacity: accountProgress.value,
    transform: [{ translateX: (1 - accountProgress.value) * 36 }],
  }));

  useEffect(() => {
    if (!visible || !accountOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      tapSelection();
      setAccountOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [visible, accountOpen]);

  useEffect(() => {
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

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthReady(true);
      return;
    }
    let active = true;
    const load = () => {
      getAccount()
        .then((acc) => {
          if (active) setAccount(acc);
        })
        .catch(() => undefined)
        .finally(() => {
          if (active) setAuthReady(true);
        });
    };
    load();
    const unsub = onAuthChange(load);
    return () => {
      active = false;
      unsub();
    };
  }, []);

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

  const handleSignIn = async () => {
    tapSelection();
    setAuthError(null);
    setSigningIn(true);
    try {
      const uid = await signInWithGoogle();
      if (!uid) return;
      void syncProfileAvatar();
      const acc = await getAccount();
      setAccount(acc);
      if (acc && !acc.username) {
        setNameValue(suggestUsernameFrom(acc.name));
        setNameError(null);
        setAccountOpen(true);
      } else {
        tapSuccess();
      }
    } catch (err) {
      setAuthError(messageOf(err));
    } finally {
      setSigningIn(false);
    }
  };

  const saveName = async () => {
    const check = validateUsername(nameValue);
    if (!check.ok) {
      setNameError(check.error);
      return;
    }
    setNameBusy(true);
    setNameError(null);
    try {
      const result = await changeUsername(check.value);
      if (result === 'taken') {
        setNameError('that username is taken');
        return;
      }
      tapSuccess();
      setAccount((prev) => (prev ? { ...prev, username: check.value } : prev));
    } catch (err) {
      setNameError(messageOf(err));
    } finally {
      setNameBusy(false);
    }
  };

  const doSignOut = async () => {
    setSignOutOpen(false);
    setAccountOpen(false);
    try {
      await signOutGoogle();
      setAccount(null);
    } catch (err) {
      setAuthError(messageOf(err));
    }
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

          {isSupabaseConfigured ? (
            <>
              <SectionLabel>Account</SectionLabel>
              {!authReady ? (
                <AccountSkeleton />
              ) : account ? (
                <Pressable
                  onPress={() => {
                    tapSelection();
                    setNameValue(account?.username ?? '');
                    setNameError(null);
                    setAccountOpen(true);
                  }}
                  android_ripple={{ color: 'rgba(255,255,255,0.03)' }}
                >
                  <Card>
                    <View style={tw`flex-row items-center p-4`}>
                      <Avatar
                        name={account.username ?? account.name ?? 'G'}
                        uri={account.avatarUrl}
                        size={52}
                      />
                      <View style={tw`ml-3.5 flex-1`}>
                        <Text
                          numberOfLines={1}
                          style={tw`font-sans-semibold text-[16px] text-white`}
                        >
                          {account.username
                            ? `@${account.username}`
                            : 'Finish setup'}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={tw`mt-0.5 font-sans text-[12px] text-slate-500`}
                        >
                          {account.email ?? 'Tap to manage your account'}
                        </Text>
                      </View>
                      <ChevronRight size={20} color="#475569" />
                    </View>
                  </Card>
                </Pressable>
              ) : (
                <Card>
                  <Pressable
                    onPress={() => void handleSignIn()}
                    disabled={signingIn}
                    android_ripple={{ color: 'rgba(255,255,255,0.03)' }}
                  >
                    <RowShell
                      Icon={GoogleIcon}
                      label="Sign in with Google"
                      hint={
                        signingIn
                          ? 'Signing in…'
                          : 'React and comment on updates'
                      }
                      last
                      tile={false}
                      iconSize={22}
                    >
                      {signingIn ? (
                        <ActivityIndicator color={CYAN} />
                      ) : (
                        <ChevronRight size={18} color="#475569" />
                      )}
                    </RowShell>
                  </Pressable>
                </Card>
              )}
              {authError ? (
                <Text style={tw`ml-1 mt-2 font-sans text-[12px] text-red-400`}>
                  {authError}
                </Text>
              ) : null}
            </>
          ) : null}

          <SectionLabel>Downloads</SectionLabel>
          <Card>
            <RowShell
              Icon={FolderIcon}
              label="Save location"
              hint="Movies/NexStream · Music/NexStream"
              tile={false}
              iconSize={26}
            >
              {null}
            </RowShell>
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

      <Animated.View
        pointerEvents={accountOpen ? 'auto' : 'none'}
        style={[StyleSheet.absoluteFill, tw`bg-background`, accountStyle]}
      >
        {accountMounted && (
          <AccountPage
            account={account}
            nameValue={nameValue}
            onChangeName={setNameValue}
            onSave={() => void saveName()}
            saving={nameBusy}
            error={nameError}
            onBack={() => {
              tapSelection();
              setAccountOpen(false);
            }}
            onSignOut={() => setSignOutOpen(true)}
          />
        )}
      </Animated.View>

      <BottomSheet open={pickerOpen} onClose={() => setPickerOpen(false)}>
        <View style={tw`items-center pb-1`}>
          <LottieView
            source={filenameAnim}
            autoPlay
            loop
            style={tw`h-32 w-32`}
          />
          <Text
            style={tw`mt-1 font-sans-bold text-[22px] tracking-tight text-white`}
          >
            Filename format
          </Text>
          <Text style={tw`mt-1 font-sans text-[13px] text-slate-400`}>
            How your saved files are named
          </Text>
        </View>
        <View style={tw`mt-5`}>
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
                  active
                    ? [
                        tw`border-primary/40`,
                        { backgroundColor: '#22d3ee40' },
                        buttonGlow,
                      ]
                    : tw`border-white/10 bg-[#131d36]`,
                  pressed ? { transform: [{ scale: 0.985 }] } : null,
                ]}
              >
                <View style={tw`flex-1`}>
                  <View
                    style={[
                      tw`self-start rounded-full px-2 py-0.5`,
                      { backgroundColor: active ? CYAN : `${CYAN}1a` },
                    ]}
                  >
                    <Text
                      style={[
                        tw`font-sans-semibold text-[11px]`,
                        { color: active ? '#030014' : CYAN },
                      ]}
                    >
                      {FORMAT_LABELS[f]}
                    </Text>
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[
                      tw`mt-1.5 ml-1 font-mono text-[11px]`,
                      active ? tw`text-white/80` : tw`text-slate-400`,
                    ]}
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

      <BottomSheet
        open={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        showGrid={false}
        border="subtle"
      >
        <View style={tw`items-center px-2 pt-2`}>
          <Text
            style={tw`font-sans-bold text-[22px] tracking-tight text-white`}
          >
            Log out
          </Text>
          <Text
            style={tw`mt-2 text-center font-sans text-[14px] leading-5 text-slate-400`}
          >
            You can sign back in anytime.
          </Text>
        </View>
        <View style={tw`mt-7 flex-row`}>
          <Pressable
            onPress={() => setSignOutOpen(false)}
            style={({ pressed }) => [
              tw`flex-1 items-center rounded-full border border-white/10 bg-white/5 py-4`,
              pressed ? { transform: [{ scale: 0.97 }] } : null,
            ]}
          >
            <Text style={tw`font-sans-semibold text-[15px] text-slate-200`}>
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void doSignOut()}
            style={({ pressed }) => [
              tw`ml-3 flex-1 items-center rounded-full bg-red-500 py-4`,
              pressed ? { transform: [{ scale: 0.97 }] } : null,
            ]}
          >
            <Text style={tw`font-sans-bold text-[15px] text-white`}>
              Log out
            </Text>
          </Pressable>
        </View>
      </BottomSheet>
    </Animated.View>
  );
}

export default memo(SettingsScreen);
