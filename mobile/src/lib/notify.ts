import notifee, {
  AndroidImportance,
  AndroidStyle,
  AuthorizationStatus,
  EventType,
  type Event,
} from 'react-native-notify-kit';
import { runDownloadCancel, CANCEL_ACTION } from './fgservice';

const CHANNEL = 'complete';
const SMALL_ICON = 'notification_icon';
const BRAND = '#22d3ee';
const TAP_TYPE = 'download-complete';

export async function ensureNotificationPermission(): Promise<boolean> {
  const settings = await notifee.requestPermission();
  return settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
}

export async function notifyDownloadComplete(
  name: string,
  thumbnail?: string
): Promise<void> {
  await notifee.createChannel({
    id: CHANNEL,
    name: 'Completed downloads',
    importance: AndroidImportance.HIGH,
  });
  await notifee.displayNotification({
    title: 'Download complete',
    body: `${name} saved to your gallery`,
    data: { type: TAP_TYPE },
    android: {
      channelId: CHANNEL,
      smallIcon: SMALL_ICON,
      color: BRAND,
      largeIcon: thumbnail,
      autoCancel: true,
      pressAction: { id: 'default' },
      style: thumbnail
        ? { type: AndroidStyle.BIGPICTURE, picture: thumbnail }
        : undefined,
    },
  });
}

function isCancelPress(event: Event): boolean {
  return (
    event.type === EventType.ACTION_PRESS &&
    event.detail.pressAction?.id === CANCEL_ACTION
  );
}

export function addDownloadTapListener(handler: () => void): () => void {
  notifee
    .getInitialNotification()
    .then((initial) => {
      if (initial?.notification.data?.type === TAP_TYPE) handler();
    })
    .catch(() => undefined);

  return notifee.onForegroundEvent((event) => {
    if (isCancelPress(event)) {
      runDownloadCancel();
      return;
    }
    if (
      event.type === EventType.PRESS &&
      event.detail.notification?.data?.type === TAP_TYPE
    ) {
      handler();
    }
  });
}

// must be registered at app entry, before render
export function registerNotificationBackgroundHandler(): void {
  notifee.onBackgroundEvent((event) => {
    if (isCancelPress(event)) runDownloadCancel();
    return Promise.resolve();
  });
}
