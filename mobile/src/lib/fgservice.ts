import notifee, { AndroidImportance } from 'react-native-notify-kit';

const CHANNEL = 'downloads';
let active = 0;
let registered = false;

export function registerDownloadService(): void {
  if (registered) return;
  registered = true;
  notifee.registerForegroundService(() => new Promise<void>(() => undefined));
}

export async function startDownloadService(): Promise<void> {
  active += 1;
  if (active > 1) return;
  try {
    await notifee.createChannel({
      id: CHANNEL,
      name: 'Downloads',
      importance: AndroidImportance.LOW,
    });
    await notifee.displayNotification({
      title: 'Downloading…',
      body: 'NexStream is finishing your download',
      android: {
        channelId: CHANNEL,
        asForegroundService: true,
        ongoing: true,
        progress: { indeterminate: true },
        smallIcon: 'notification_icon',
        pressAction: { id: 'default' },
      },
    });
  } catch {
    active = Math.max(0, active - 1);
  }
}

export async function stopDownloadService(): Promise<void> {
  active = Math.max(0, active - 1);
  if (active > 0) return;
  try {
    await notifee.stopForegroundService();
  } catch {
    /* best-effort */
  }
}
