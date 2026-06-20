import {
  selectionAsync,
  impactAsync,
  ImpactFeedbackStyle,
  notificationAsync,
  NotificationFeedbackType,
} from 'expo-haptics';
import { getHaptics } from './settings';

let enabled = true;

export async function loadHaptics(): Promise<void> {
  enabled = await getHaptics();
}

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

export function tapSelection(): void {
  if (enabled) selectionAsync().catch(() => undefined);
}

export function tapImpact(): void {
  if (enabled) {
    impactAsync(ImpactFeedbackStyle.Medium).catch(() => undefined);
  }
}

export function tapSuccess(): void {
  if (enabled) {
    notificationAsync(NotificationFeedbackType.Success).catch(() => undefined);
  }
}
