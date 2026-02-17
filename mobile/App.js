import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, View, StatusBar, Platform, Image, Text, Animated, ActivityIndicator, RefreshControl, ScrollView, Dimensions, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as NavigationBar from 'expo-navigation-bar';
import * as Clipboard from 'expo-clipboard';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';

SplashScreen.preventAutoHideAsync();

const { StorageAccessFramework: SAF, cacheDirectory } = FileSystem;
const LOCAL_IP = '192.168.1.92';
const DEV_URL = `http://${LOCAL_IP}:5173`;
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const STORAGE_KEY = '@nexstream_download_uri';

export default function App() {
  const [refreshing, setRefreshing] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [error, setError] = useState(null);
  const [targetDirectory, setTargetDirectory] = useState(null);
  const activeDownloads = useRef(new Set()); // Lock active downloads by filename
  
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
      console.error('[SAF] Pick Error:', err);
      return null;
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    webViewRef.current?.injectJavaScript(`(function(){if(window.onNativeRefresh)window.onNativeRefresh();else location.reload();})();true;`);
    setTimeout(() => setRefreshing(false), 1500);
  }, []);

  const onMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'CONSOLE_LOG') { return; }

      if (data.type === 'DOWNLOAD_FILE') {
        const { url, fileName, mimeType } = data.payload;
        
        // 1. ATOMIC LOCK: Prevent parallel downloads of the same file
        if (activeDownloads.current.has(fileName)) {
          console.log(`[DEBUG] Blocking duplicate download for: ${fileName}`);
          return;
        }
        activeDownloads.current.add(fileName);

        try {
          let directoryUri = targetDirectory;
          if (!directoryUri) {
            Alert.alert("Setup Storage", "Choose a folder for your downloads.");
            directoryUri = await pickDirectory();
            if (!directoryUri) {
              activeDownloads.current.delete(fileName);
              return;
            }
          }

          // Safe Local Path (Remove spaces for internal FS reliability)
          const safeInternalName = fileName.replace(/\s+/g, '_');
          const localUri = cacheDirectory + safeInternalName;
          
          const callback = (p) => {
            if (p.totalBytesExpectedToWrite > 0) {
              const pct = Math.round((p.totalBytesWritten / p.totalBytesExpectedToWrite) * 100);
              webViewRef.current?.injectJavaScript(`if(window.onDownloadProgress)window.onDownloadProgress(${pct});true;`);
            }
          };

          const dr = FileSystem.createDownloadResumable(url, localUri, {}, callback);
          const result = await dr.downloadAsync();
          
          // 2. MEMORY SAFE SAVING
          try {
            const fileInfo = await FileSystem.getInfoAsync(result.uri);
            if (fileInfo.size > 60 * 1024 * 1024) {
              await Sharing.shareAsync(result.uri, { mimeType, dialogTitle: fileName });
            } else {
              const base64 = await FileSystem.readAsStringAsync(result.uri, { encoding: FileSystem.EncodingType.Base64 });
              const safFileUri = await SAF.createFileAsync(directoryUri, fileName, mimeType);
              await FileSystem.writeAsStringAsync(safFileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
              // Check if file still exists before deleting (prevent race crash)
              const check = await FileSystem.getInfoAsync(result.uri);
              if (check.exists) await FileSystem.deleteAsync(result.uri);
              Alert.alert("Success", "Saved to folder!");
            }
          } catch (safErr) {
            console.error('[SAF] Error during save:', safErr);
            await Sharing.shareAsync(result.uri, { mimeType, dialogTitle: fileName });
          }
        } finally {
          activeDownloads.current.delete(fileName); // ALWAYS release lock
        }
      }

      if (data.type === 'REQUEST_CLIPBOARD') {
        const text = await Clipboard.getStringAsync();
        const safeText = JSON.stringify(text);
        webViewRef.current?.injectJavaScript(`(function(){if(window.onNativePaste)window.onNativePaste(${safeText});})();true;`);
      }
    } catch (e) {
      console.error('[DEBUG] Bridge Error:', e);
    }
  };

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: '#030014' }}>
      <View style={styles.container}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={ <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ffffff']} progressBackgroundColor={'#0891b2'} progressViewOffset={40} /> }
          scrollEnabled={true} bounces={false} overScrollMode="never"
        >
          <View style={{ flex: 1, height: SCREEN_HEIGHT }}>
            <WebView
              ref={webViewRef}
              source={{ uri: DEV_URL }}
              onMessage={onMessage}
              onLoadEnd={() => {
                setError(null);
                Animated.timing(splashOverlayOpacity, { toValue: 0, duration: 600, useNativeDriver: true }).start(() => {
                  setAppReady(true);
                  SplashScreen.hideAsync();
                });
              }}
              onError={(e) => setError(e.nativeEvent.description)}
              onShouldStartLoadWithRequest={(r) => !r.url.includes('/convert')}
              onRenderProcessGone={() => webViewRef.current?.reload()}
              onContentProcessDidTerminate={() => webViewRef.current?.reload()}
              style={styles.webview}
              containerStyle={styles.webviewContainer}
              bounces={false} overScrollMode="never"
              mixedContentMode="always" allowsInsecureLocalhost={true}
              domStorageEnabled={true} javaScriptEnabled={true}
              backgroundColor="transparent"
            />
          </View>
        </ScrollView>

        {appReady && (
          <TouchableOpacity style={styles.folderBtn} onPress={pickDirectory}>
            <Text style={styles.folderBtnText}>📁 {targetDirectory ? 'Change Folder' : 'Set Storage'}</Text>
          </TouchableOpacity>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Connection Error</Text>
            <Text style={styles.errorText}>{error}</Text>
            <ActivityIndicator color="#00ff88" style={{ marginTop: 20 }} />
          </View>
        )}

        {!appReady && !error && (
          <Animated.View style={[styles.customSplashOverlay, { opacity: splashOverlayOpacity }]} pointerEvents="none">
            <Image source={require('./assets/icon.png')} style={styles.splashLogo} resizeMode="contain" />
            <Text style={styles.splashTitle}>NexStream</Text>
            <View style={styles.loaderContainer}>
              <ActivityIndicator color="#00ff88" style={{ marginBottom: 10 }} />
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
  splashLogo: { width: 220, height: 220, marginBottom: 20 },
  splashTitle: { fontSize: 32, fontWeight: '800', color: '#fff', letterSpacing: 2 },
  loaderContainer: { position: 'absolute', bottom: 50 },
  loadingText: { color: '#00ff88', fontSize: 12, fontWeight: '700', letterSpacing: 4, textTransform: 'uppercase' },
  errorContainer: { ...StyleSheet.absoluteFillObject, backgroundColor: '#030014', alignItems: 'center', justifyContent: 'center', padding: 20 },
  errorTitle: { color: '#ff4444', fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
  errorText: { color: '#fff', textAlign: 'center' },
  folderBtn: { position: 'absolute', top: 60, right: 20, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', zIndex: 1000 },
  folderBtnText: { color: '#aaa', fontSize: 10, fontWeight: 'bold' }
});