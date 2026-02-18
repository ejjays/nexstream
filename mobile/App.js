import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, View, StatusBar, Platform, Image, Text, Animated, ActivityIndicator, RefreshControl, ScrollView, Dimensions, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as NavigationBar from 'expo-navigation-bar';
import * as Clipboard from 'expo-clipboard';
import * as SplashScreen from 'expo-splash-screen';
import { CheckCircle2 } from 'lucide-react-native';

SplashScreen.preventAutoHideAsync();

const DEV_URL = 'http://192.168.1.92:5173';
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SUBFOLDER_NAME = 'NexStream';

export default function App() {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshEnabled, setRefreshEnabled] = useState(true);
  const [appReady, setAppReady] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState({ visible: false, fileName: '' });
  
  const webViewRef = useRef(null);
  const splashOverlayOpacity = useRef(new Animated.Value(1)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const activeDownloads = useRef(new Set());

  useEffect(() => {
    (async () => {
      if (Platform.OS === 'android') {
        await NavigationBar.setButtonStyleAsync('light');
      }
      // Pre-request permissions
      await MediaLibrary.requestPermissionsAsync();
    })();
  }, []);

  const showToast = (fileName) => {
    setToast({ visible: true, fileName });
    Animated.timing(toastOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    setTimeout(() => {
      Animated.timing(toastOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
        setToast({ visible: false, fileName: '' });
      });
    }, 3500);
  };

  const onMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'SET_REFRESH_ENABLED') { setRefreshEnabled(data.payload); return; }
      if (data.type === 'OPEN_FILE') { Alert.alert("NexStream", "Files are saved to your Gallery in the 'NexStream' album."); return; }

      if (data.type === 'DOWNLOAD_FILE') {
        const { url, fileName, mimeType } = data.payload;
        if (activeDownloads.current.has(fileName)) return;
        activeDownloads.current.add(fileName);

        try {
          const safeInternalName = fileName.replace(/\s+/g, '_');
          const localUri = FileSystem.cacheDirectory + safeInternalName;
          
          const dr = FileSystem.createDownloadResumable(url, localUri, {}, (p) => {
            if (p.totalBytesExpectedToWrite > 0) {
              const pct = Math.round((p.totalBytesWritten / p.totalBytesExpectedToWrite) * 100);
              webViewRef.current?.injectJavaScript(`if(window.onDownloadProgress)window.onDownloadProgress(${pct});true;`);
            }
          });
          
          const result = await dr.downloadAsync();
          
          try {
            // --- MEDIA LIBRARY SAVE (Handles Large Files & Gallery) ---
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status !== 'granted') {
               throw new Error('Media Library permission not granted');
            }
  
            const asset = await MediaLibrary.createAssetAsync(result.uri);
            let album = await MediaLibrary.getAlbumAsync(SUBFOLDER_NAME);
            
            if (!album) {
              await MediaLibrary.createAlbumAsync(SUBFOLDER_NAME, asset, false);
            } else {
              await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
            }
            
            // Cleanup cache is handled by createAssetAsync moving/copying usually, but we can try deleting original if it still exists
            await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
            
            showToast(fileName);
  
          } catch (err) {
            console.error("Save failed, falling back to Share Sheet:", err);
            await Sharing.shareAsync(result.uri, { mimeType, dialogTitle: fileName });
          }

        } catch(e) {
             console.error("Download failed:", e);
        } finally { 
            activeDownloads.current.delete(fileName); 
        }
      }
      if (data.type === 'REQUEST_CLIPBOARD') {
        const text = await Clipboard.getStringAsync();
        webViewRef.current?.injectJavaScript(`(function(){if(window.onNativePaste)window.onNativePaste(${JSON.stringify(text)});})();true;`);
      }
    } catch (e) { console.error('[DEBUG] Bridge Error:', e); }
  };

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: '#030014' }}>
      <View style={styles.container}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={ <RefreshControl refreshing={refreshing} onRefresh={useCallback(() => { if (!refreshEnabled) return; setRefreshing(true); webViewRef.current?.reload(); setTimeout(() => setRefreshing(false), 1500); }, [refreshEnabled])} enabled={refreshEnabled} colors={['#ffffff']} progressBackgroundColor={'#0891b2'} progressViewOffset={40} /> }
          scrollEnabled={true} bounces={false} overScrollMode="never"
        >
          <View style={{ flex: 1, height: SCREEN_HEIGHT }}>
            <WebView
              ref={webViewRef}
              source={{ uri: DEV_URL }}
              onMessage={onMessage}
              onLoadEnd={() => {
                Animated.timing(splashOverlayOpacity, { toValue: 0, duration: 600, useNativeDriver: true }).start(() => {
                  setAppReady(true);
                  SplashScreen.hideAsync();
                  webViewRef.current?.injectJavaScript(`window.isNexStreamNative = true; if (window.onNativeHandshake) window.onNativeHandshake(); true;`);
                });
              }}
              userAgent="NexStream-App"
              style={styles.webview}
              containerStyle={styles.webviewContainer}
              bounces={false} overScrollMode="never"
              mixedContentMode="always" allowsInsecureLocalhost={true}
              domStorageEnabled={true} javaScriptEnabled={true}
              backgroundColor="transparent"
            />
          </View>
        </ScrollView>

        {toast.visible && (
          <Animated.View style={[styles.toastContainer, { opacity: toastOpacity }]}>
            <View style={styles.toastContent}>
              <CheckCircle2 color="#06b6d4" size={20} />
              <View style={styles.toastTextContainer}>
                <Text style={styles.toastTitle}>SAVED TO GALLERY</Text>
                <Text style={styles.toastFileName} numberOfLines={1}>{toast.fileName}</Text>
              </View>
            </View>
          </Animated.View>
        )}

        {!appReady && !error && (
          <Animated.View style={[styles.customSplashOverlay, { opacity: splashOverlayOpacity }]} pointerEvents="none">
            <Image source={require('./assets/splash-icon.png')} style={styles.splashLogo} resizeMode="contain" />
            <Text style={styles.splashTitle}>NexStream</Text>
            <View style={styles.loaderContainer}>
              <ActivityIndicator color="#06b6d4" size="large" style={{ marginBottom: 15 }} />
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
  customSplashOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#030014', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  splashLogo: { width: 320, height: 320, marginTop: -50 },
  splashTitle: { fontSize: 36, fontWeight: '900', color: '#fff', letterSpacing: 3, marginTop: -40, textTransform: 'uppercase' },
  loaderContainer: { position: 'absolute', bottom: 80, alignItems: 'center' },
  loadingText: { color: '#06b6d4', fontSize: 13, fontWeight: '800', letterSpacing: 5, textTransform: 'uppercase' },
  toastContainer: { position: 'absolute', bottom: 100, left: 20, right: 20, alignItems: 'center', zIndex: 2000 },
  toastContent: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a0a1a', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(6, 182, 212, 0.3)', shadowColor: '#06b6d4', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 10, maxWidth: '100%' },
  toastTextContainer: { marginLeft: 12, flexShrink: 1 },
  toastTitle: { color: '#06b6d4', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  toastFileName: { color: '#fff', fontSize: 12, fontWeight: '600', marginTop: 1 }
});