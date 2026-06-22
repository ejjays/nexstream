import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';
import { registerRootComponent } from 'expo';

import App from './App';
import { initCrashReporter, wrap } from './src/lib/crash';
import { registerNotificationBackgroundHandler } from './src/lib/notify';

initCrashReporter();
registerNotificationBackgroundHandler();
registerRootComponent(wrap(App));
