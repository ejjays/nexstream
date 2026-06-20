import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
});

export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

export async function notifyDownloadComplete(name: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Download complete',
      body: `${name} saved to your gallery`,
      data: { type: 'download-complete' },
    },
    trigger: null,
  });
}

export function addDownloadTapListener(handler: () => void) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (data?.type === 'download-complete') handler();
  });
}
