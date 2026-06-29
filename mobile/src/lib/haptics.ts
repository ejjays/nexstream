import { Vibration } from 'react-native';
import { getHaptics } from './settings';

let enabled = true;

export async function loadHaptics(): Promise<void> {
  enabled = await getHaptics();
}

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

export function tapSelection(): void {
  // motor renders only coarse multi-pulse buzz — single pulses & expo-haptics (VibrationEffect) silent here; no tap haptic, kept for success/impact
}

export function tapImpact(): void {
  if (enabled) Vibration.vibrate([0, 55, 90, 55]);
}

export function tapSuccess(): void {
  if (enabled) Vibration.vibrate([0, 40, 80, 40]);
}
