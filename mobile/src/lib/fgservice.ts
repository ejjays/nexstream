import notifee, { AndroidImportance } from 'react-native-notify-kit';

const CHANNEL = 'downloads';
const NOTIF_ID = 'nexstream-download';
const SMALL_ICON = 'notification_icon';
const BRAND = '#22d3ee';

export const CANCEL_ACTION = 'cancel-download';

let active = 0;
let registered = false;
let lastPercent = -1;
let cancelHandler: (() => void) | null = null;

export function setDownloadCancelHandler(handler: (() => void) | null): void {
  cancelHandler = handler;
}

export function runDownloadCancel(): void {
  cancelHandler?.();
}

export function registerDownloadService(): void {
  if (registered) return;
  registered = true;
  notifee.registerForegroundService(() => new Promise<void>(() => undefined));
}

export async function startDownloadService(): Promise<void> {
  active += 1;
  if (active > 1) return;
  lastPercent = -1;
  try {
    await notifee.createChannel({
      id: CHANNEL,
      name: 'Downloads',
      importance: AndroidImportance.LOW,
    });
    await notifee.displayNotification({
      id: NOTIF_ID,
      title: 'Downloading…',
      body: 'Preparing your download',
      android: {
        channelId: CHANNEL,
        asForegroundService: true,
        ongoing: true,
        onlyAlertOnce: true,
        smallIcon: SMALL_ICON,
        color: BRAND,
        progress: { indeterminate: true },
        pressAction: { id: 'default' },
        actions: [{ title: 'Cancel', pressAction: { id: CANCEL_ACTION } }],
      },
    });
  } catch {
    active = Math.max(0, active - 1);
  }
}

export function updateDownloadProgress(percent: number): void {
  if (active <= 0) return;
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  if (pct === lastPercent) return;
  lastPercent = pct;
  notifee
    .displayNotification({
      id: NOTIF_ID,
      title: 'Downloading…',
      body: `${pct}% complete`,
      android: {
        channelId: CHANNEL,
        asForegroundService: true,
        ongoing: true,
        onlyAlertOnce: true,
        smallIcon: SMALL_ICON,
        color: BRAND,
        progress: { max: 100, current: pct },
        pressAction: { id: 'default' },
        actions: [{ title: 'Cancel', pressAction: { id: CANCEL_ACTION } }],
      },
    })
    .catch(() => undefined);
}

export async function stopDownloadService(): Promise<void> {
  active = Math.max(0, active - 1);
  if (active > 0) return;
  lastPercent = -1;
  try {
    await notifee.stopForegroundService();
  } catch {
    /* best-effort */
  }
}

// true when the OS may pause long background downloads
export function isBatteryRestricted(): Promise<boolean> {
  return notifee.isBatteryOptimizationEnabled();
}

export function openBatterySettings(): Promise<void> {
  return notifee.openBatteryOptimizationSettings();
}
