import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';
import { registerRootComponent } from 'expo';
import messaging from '@react-native-firebase/messaging';

import App from './App';
import { initCrashReporter, wrap } from './src/lib/crash';
import { registerNotificationBackgroundHandler } from './src/lib/notify';
import { displaySocialNotification } from './src/lib/social/pushRender';

initCrashReporter();
registerNotificationBackgroundHandler();

(
  globalThis as { RNFB_SILENCE_MODULAR_DEPRECATION_WARNINGS?: boolean }
).RNFB_SILENCE_MODULAR_DEPRECATION_WARNINGS = true;

try {
  messaging().setBackgroundMessageHandler(async (message) => {
    await displaySocialNotification(message);
  });
} catch {
  /* native FCM module absent on a pre-rebuild dev client */
}

registerRootComponent(wrap(App));
