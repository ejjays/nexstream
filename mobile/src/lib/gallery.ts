import * as IntentLauncher from 'expo-intent-launcher';

export async function openGallery(): Promise<void> {
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
      category: 'android.intent.category.APP_GALLERY',
    });
  } catch {
    /* no gallery app available */
  }
}
