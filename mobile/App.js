import React, { useState, useEffect } from 'react';
import { StyleSheet, View, StatusBar, ActivityIndicator, Text, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as NavigationBar from 'expo-navigation-bar';

const LOCAL_IP = '192.168.1.92';
const DEV_URL = `http://${LOCAL_IP}:5173`;

export default function App() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (Platform.OS === 'android') {
      // Makes the Android bottom navigation bar transparent and edge-to-edge
      NavigationBar.setPositionAsync('absolute');
      NavigationBar.setBackgroundColorAsync('#00000000');
      NavigationBar.setButtonStyleAsync('light');
    }
  }, []);

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
    } catch (e) {
      console.error('[Mobile] Bridge Error:', e);
    }
  };

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        {/* Transparent StatusBar */}
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        
        <View style={styles.content}>
          <WebView
            source={{ uri: DEV_URL }}
            onMessage={onMessage}
            onLoadEnd={() => setLoading(false)}
            style={styles.webview}
            mixedContentMode="always"
            allowsInsecureLocalhost={true}
            // Optimization for transparent background
            backgroundColor="transparent"
            containerStyle={{ backgroundColor: '#000' }}
          />
          {loading && (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color="#00ff88" />
              <Text style={styles.loaderText}>Connecting to NexStream Engine...</Text>
            </View>
          )}
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  loaderText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 14,
    fontWeight: '600',
  },
});