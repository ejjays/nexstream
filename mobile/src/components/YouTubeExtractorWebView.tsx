import { useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { attachWebView, onWebViewMessage } from '../extractors/youtube/bridge';
import { YT_EXTRACTOR_HTML } from '../extractors/youtube/webviewSource';

export default function YouTubeExtractorWebView() {
  const ref = useRef<WebView>(null);

  return (
    /* offscreen wrapper; out of layout flow */
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -10000,
        left: 0,
        width: 200,
        height: 200,
        opacity: 0,
      }}
    >
      <WebView
        ref={ref}
        source={{
          html: YT_EXTRACTOR_HTML,
          baseUrl: 'https://www.youtube.com/',
        }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        onLoadStart={() =>
          attachWebView((js) => ref.current?.injectJavaScript(js))
        }
        onMessage={(event) => onWebViewMessage(event.nativeEvent.data)}
        onError={({ nativeEvent }) =>
          console.warn(`[JS-YT/wv] load error: ${nativeEvent.description}`)
        }
        style={{ flex: 1 }}
      />
    </View>
  );
}
