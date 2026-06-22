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
  if (enabled) Vibration.vibrate(15);
}

export function tapImpact(): void {
  if (enabled) Vibration.vibrate(35);
}

export function tapSuccess(): void {
  if (enabled) Vibration.vibrate([0, 40, 90, 40]);
}
