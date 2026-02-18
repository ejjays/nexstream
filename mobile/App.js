import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  StatusBar,
  Platform,
  Image,
  Text,
  Animated,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  Modal
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as NavigationBar from 'expo-navigation-bar';
import * as Clipboard from 'expo-clipboard';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CheckCircle2 } from 'lucide-react-native';

SplashScreen.preventAutoHideAsync();

const { StorageAccessFramework: SAF, cacheDirectory } = FileSystemLegacy;
const LOCAL_IP = '192.168.1.51';
const DEV_URL = `http://${LOCAL_IP}:5173`;
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const STORAGE_KEY = '@nexstream_download_uri';

export default function App() {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshEnabled, setRefreshEnabled] = useState(true);
  const [appReady, setAppReady] = useState(false);
  const [error, setError] = useState(null);
  const [targetDirectory, setTargetDirectory] = useState(null);
  const [successModal, setSuccessModal] = useState({
    visible: false,
    fileName: ''
  });
  const activeDownloads = useRef(new Set());

  const webViewRef = useRef(null);
  const splashOverlayOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    (async () => {
      if (Platform.OS === 'android') {
        const savedUri = await AsyncStorage.getItem(STORAGE_KEY);
        if (savedUri) setTargetDirectory(savedUri);
        NavigationBar.setButtonStyleAsync('light');
      }
    })();
  }, []);

  const onRefresh = useCallback(() => {
    if (!refreshEnabled) return;
    setRefreshing(true);
    webViewRef.current?.injectJavaScript(
      `(function(){if(window.onNativeRefresh)window.onNativeRefresh();else location.reload();})();true;`
    );
    setTimeout(() => setRefreshing(false), 1500);
  }, [refreshEnabled]);

  const onMessage = async event => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      // MODAL PROTECTION: Toggle Refresher
      if (data.type === 'SET_REFRESH_ENABLED') {
        setRefreshEnabled(data.payload);
        return;
      }

      if (data.type === 'DOWNLOAD_FILE') {
        const { url, fileName, mimeType } = data.payload;
        if (activeDownloads.current.has(fileName)) return;
        activeDownloads.current.add(fileName);

        try {
          let directoryUri = targetDirectory;
          if (!directoryUri) {
            directoryUri = await pickDirectory();
            if (!directoryUri) {
              activeDownloads.current.delete(fileName);
              return;
            }
          }

          const safeInternalName = fileName.replace(/\s+/g, '_');
          const localUri =
            (cacheDirectory || FileSystemLegacy.cacheDirectory) +
            safeInternalName;
          const callback = p => {
            if (p.totalBytesExpectedToWrite > 0) {
              const pct = Math.round(
                (p.totalBytesWritten / p.totalBytesExpectedToWrite) * 100
              );
              webViewRef.current?.injectJavaScript(
                `if(window.onDownloadProgress)window.onDownloadProgress(${pct});true;`
              );
            }
          };
          const dr = FileSystemLegacy.createDownloadResumable(
            url,
            localUri,
            {},
            callback
          );
          const result = await dr.downloadAsync();

          try {
            const fileInfo = await FileSystemLegacy.getInfoAsync(result.uri);
            if (fileInfo.size > 60 * 1024 * 1024) {
              await Sharing.shareAsync(result.uri, {
                mimeType,
                dialogTitle: fileName
              });
            } else {
              const base64 = await FileSystemLegacy.readAsStringAsync(
                result.uri,
                { encoding: FileSystemLegacy.EncodingType.Base64 }
              );
              const safFileUri = await SAF.createFileAsync(
                directoryUri,
                fileName,
                mimeType
              );
              await FileSystemLegacy.writeAsStringAsync(safFileUri, base64, {
                encoding: FileSystemLegacy.EncodingType.Base64
              });
              await FileSystemLegacy.deleteAsync(result.uri);
              setSuccessModal({ visible: true, fileName });
            }
          } catch (safErr) {
            await Sharing.shareAsync(result.uri, {
              mimeType,
              dialogTitle: fileName
            });
          }
        } finally {
          activeDownloads.current.delete(fileName);
        }
      }

      if (data.type === 'REQUEST_CLIPBOARD') {
        const text = await Clipboard.getStringAsync();
        const safeText = JSON.stringify(text);
        webViewRef.current?.injectJavaScript(
          `(function(){if(window.onNativePaste)window.onNativePaste(${safeText});})();true;`
        );
      }
    } catch (e) {
      console.error('[Mobile] Bridge Error:', e);
    }
  };

  const pickDirectory = async () => {
    try {
      const permissions = await SAF.requestDirectoryPermissionsAsync();
      if (permissions.granted) {
        await AsyncStorage.setItem(STORAGE_KEY, permissions.directoryUri);
        setTargetDirectory(permissions.directoryUri);
        return permissions.directoryUri;
      }
      return null;
    } catch (err) {
      return null;
    }
  };

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: '#030014' }}>
      <View style={styles.container}>
        <StatusBar
          translucent
          backgroundColor='transparent'
          barStyle='light-content'
        />

        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              enabled={refreshEnabled} // CRITICAL FIX: Controlled by modal state
              colors={['#ffffff']}
              progressBackgroundColor={'#0891b2'}
              progressViewOffset={40}
            />
          }
          scrollEnabled={true}
          bounces={false}
          overScrollMode='never'
        >
          <View style={{ flex: 1, height: SCREEN_HEIGHT }}>
            <WebView
              ref={webViewRef}
              source={{ uri: DEV_URL }}
              onMessage={onMessage}
              onLoadEnd={() => {
                setError(null);
                Animated.timing(splashOverlayOpacity, {
                  toValue: 0,
                  duration: 600,
                  useNativeDriver: true
                }).start(() => {
                  setAppReady(true);
                  SplashScreen.hideAsync();
                });
              }}
              onError={e => setError(e.nativeEvent.description)}
              onShouldStartLoadWithRequest={r => !r.url.includes('/convert')}
              style={styles.webview}
              containerStyle={styles.webviewContainer}
              bounces={false}
              overScrollMode='never'
              mixedContentMode='always'
              allowsInsecureLocalhost={true}
              domStorageEnabled={true}
              javaScriptEnabled={true}
              backgroundColor='transparent'
            />
          </View>
        </ScrollView>

        {appReady && (
          <TouchableOpacity style={styles.folderBtn} onPress={pickDirectory}>
            <Text style={styles.folderBtnText}>
              📁 {targetDirectory ? 'Change Folder' : 'Set Storage'}
            </Text>
          </TouchableOpacity>
        )}

        <Modal
          animationType='fade'
          transparent={true}
          visible={successModal.visible}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.successIconCircle}>
                <CheckCircle2 color='#06b6d4' size={32} />
              </View>
              <Text style={styles.modalTitle}>Download Ready</Text>
              <Text style={styles.modalFileName} numberOfLines={2}>
                {successModal.fileName}
              </Text>
              <Text style={styles.modalSubText}>
                Successfully saved to your chosen folder.
              </Text>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() =>
                  setSuccessModal({ ...successModal, visible: false })
                }
              >
                <Text style={styles.modalCloseBtnText}>ACKNOWLEDGE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {!appReady && !error && (
          <Animated.View
            style={[
              styles.customSplashOverlay,
              { opacity: splashOverlayOpacity }
            ]}
            pointerEvents='none'
          >
            <Image
              source={require('./assets/icon.png')}
              style={styles.splashLogo}
              resizeMode='contain'
            />
            <Text style={styles.splashTitle}>NexStream</Text>
            <View style={styles.loaderContainer}>
              <ActivityIndicator color='#06b6d4' style={{ marginBottom: 10 }} />
              <Text style={styles.loadingText}>Initializing Engine...</Text>
            </View>
          </Animated.View>
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030014' },
  webview: { flex: 1, backgroundColor: 'transparent' },
  webviewContainer: { flex: 1, backgroundColor: '#030014' },
  customSplashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#030014',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999
  },
  splashLogo: { width: 220, height: 220, marginBottom: 20 },
  splashTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 2
  },
  loaderContainer: { position: 'absolute', bottom: 50 },
  loadingText: {
    color: '#06b6d4',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 4,
    textTransform: 'uppercase'
  },
  folderBtn: {
    position: 'absolute',
    top: 60,
    right: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    zIndex: 1000
  },
  folderBtnText: { color: '#aaa', fontSize: 10, fontWeight: 'bold' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(3, 0, 20, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#0a0a1a',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    padding: 24,
    alignItems: 'center',
    shadowColor: '#06b6d4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10
  },
  successIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.2)'
  },
  modalTitle: {
    color: '#06b6d4',
    fontSize: 18,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8
  },
  modalFileName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
    opacity: 0.9
  },
  modalSubText: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 18
  },
  modalCloseBtn: {
    width: '100%',
    backgroundColor: '#06b6d4',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalCloseBtnText: {
    color: '#030014',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1
  }
});
