import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, View, StatusBar, Platform, ScrollView, RefreshControl, Image, Text, Animated, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as NavigationBar from 'expo-navigation-bar';
import * as Clipboard from 'expo-clipboard';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

const LOCAL_IP = '192.168.1.92';
const DEV_URL = `http://${LOCAL_IP}:5173`;

export default function App() {
  const [refreshing, setRefreshing] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);
  const [appReady, setAppReady] = useState(false);
  const webViewRef = useRef(null);
  const splashOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setButtonStyleAsync('light');
    }
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    webViewRef.current?.injectJavaScript(`
      (function() {
        if (window.onNativeRefresh) {
          window.onNativeRefresh();
        } else {
          location.reload();
        }
      })();
      true;
    `);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const handleScroll = (event) => {
    const yOffset = event.nativeEvent.contentOffset.y;
    setIsEnabled(yOffset <= 0);
  };

  const onMessage = async (event) => {
    try {
      const { type, payload } = JSON.parse(event.nativeEvent.data);
      if (type === 'DOWNLOAD_FILE') {
        const { url, fileName, mimeType } = payload;
        const localUri = FileSystem.cacheDirectory + fileName;
        const downloadRes = await FileSystem.downloadAsync(url, localUri);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(downloadRes.uri, {
            mimeType: mimeType || 'video/mp4',
            dialogTitle: `Save ${fileName}`,
          });
        }
      }
      if (type === 'REQUEST_CLIPBOARD') {
        const text = await Clipboard.getStringAsync();
        const safeText = JSON.stringify(text);
        webViewRef.current?.injectJavaScript(`
          (function() {
            if (window.onNativePaste) {
              window.onNativePaste(${safeText});
            }
          })();
          true;
        `);
      }
    } catch (e) {
      console.error('[Mobile] Bridge Error:', e);
    }
  };

  const logoScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setButtonStyleAsync('light');
    }

    // Breathing animation for the logo
    Animated.loop(
      Animated.sequence([
        Animated.timing(logoScale, {
          toValue: 1.05,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const hideSplash = () => {
    // Smooth transition from Splash to WebView
    Animated.timing(splashOpacity, {
      toValue: 0,
      duration: 600,
      useNativeDriver: true,
    }).start(() => {
      setAppReady(true);
      SplashScreen.hideAsync();
    });
  };

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <ScrollView
          contentContainerStyle={styles.scrollView}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              enabled={isEnabled}
              progressViewOffset={40}
              colors={['#ffffff']}
              tintColor={'#ffffff'}
              progressBackgroundColor={'#0891b2'}
            />
          }
          scrollEnabled={false}
        >
          <View style={styles.content}>
            <WebView
              ref={webViewRef}
              source={{ uri: DEV_URL }}
              onMessage={onMessage}
              onLoadEnd={hideSplash}
              onScroll={handleScroll}
              style={styles.webview}
              containerStyle={styles.webviewContainer}
              mixedContentMode="always"
              allowsInsecureLocalhost={true}
              bounces={false}
              overScrollMode="never"
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
            />
          </View>
        </ScrollView>

        {/* CUSTOM BRANDED SPLASH OVERLAY */}
        {!appReady && (
          <Animated.View style={[styles.brandedSplash, { opacity: splashOpacity }]}>
            <Animated.Image 
              source={require('./assets/logo.webp')} 
              style={[styles.splashLogo, { transform: [{ scale: logoScale }] }]} 
              resizeMode="contain"
            />
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
  container: {
    flex: 1,
    backgroundColor: '#030014',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: '#030014',
  },
  webviewContainer: {
    backgroundColor: '#030014',
  },
  brandedSplash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#030014',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  splashLogo: {
    width: 150,
    height: 150,
    marginBottom: 20,
  },
  splashTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica' : 'sans-serif-condensed',
  },
  loaderContainer: {
    position: 'absolute',
    bottom: 50,
  },
  loadingText: {
    color: '#00ff88',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
});