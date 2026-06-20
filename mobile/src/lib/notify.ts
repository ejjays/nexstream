import {
  setNotificationHandler,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  addNotificationResponseReceivedListener,
} from 'expo-notifications';

setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
});

export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await getPermissionsAsync();
  if (current.granted) return true;
  const next = await requestPermissionsAsync();
  return next.granted;
}

export async function notifyDownloadComplete(name: string): Promise<void> {
  await scheduleNotificationAsync({
    content: {
      title: 'Download complete',
      body: `${name} saved to your gallery`,
      data: { type: 'download-complete' },
    },
    trigger: null,
  });
}

export function addDownloadTapListener(handler: () => void) {
  return addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (data?.type === 'download-complete') handler();
  });
}
