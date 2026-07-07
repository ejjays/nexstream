import { useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  attachInstagramWebView,
  onInstagramWebViewMessage,
  resetInstagramReady,
} from '../extractors/instagram/bridge';
import { log, warn as logWarn } from '../lib/log';

const IG_EXTRACTOR_HTML = `<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body>
<script>
  window.__post = function (m) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {}
  };
  
  window.addEventListener('error', function (e) {
    window.__post({
      log: true,
      stage: 'error',
      detail: (e.message || '') + ' @ ' + (e.filename || '') + ':' + (e.lineno || 0),
    });
  });

  window.__post({ type: 'ready' });

  window.__webviewFetch = async (reqId, url, init) => {
    try {
      const res = await fetch(url, init);
      const text = await res.text();
      window.__post({
        type: 'fetchResult',
        reqId: reqId,
        ok: res.ok,
        status: res.status,
        text: text,
      });
    } catch (e) {
      window.__post({
        type: 'fetchResult',
        reqId: reqId,
        ok: false,
        status: 500,
        text: e.message || String(e),
      });
    }
  };
</script>
</body>
</html>
`;

export default function InstagramExtractorWebView() {
  const ref = useRef<WebView>(null);

  const recover = (reason: string): void => {
    logWarn(
      'InstagramExtractorWebView',
      `[JS-IG/wv] ${reason}; reloading webview`
    );
    resetInstagramReady();
    ref.current?.reload();
  };

  return (
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
          html: IG_EXTRACTOR_HTML,
          baseUrl: 'https://www.instagram.com/',
        }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        onLoadStart={() =>
          attachInstagramWebView((js) => ref.current?.injectJavaScript(js))
        }
        onLoadEnd={() => {
          log(
            'InstagramExtractorWebView',
            '[JS-IG/wv] page load end; ready'
          );
        }}
        onMessage={(event) => onInstagramWebViewMessage(event.nativeEvent.data)}
        onError={({ nativeEvent }) =>
          logWarn(
            'InstagramExtractorWebView',
            `[JS-IG/wv] load error: ${nativeEvent.code} ${nativeEvent.description} @ ${nativeEvent.url}`
          )
        }
        onHttpError={({ nativeEvent }) =>
          logWarn(
            'InstagramExtractorWebView',
            `[JS-IG/wv] http error: ${nativeEvent.statusCode} @ ${nativeEvent.url}`
          )
        }
        onRenderProcessGone={({ nativeEvent }) =>
          recover(`render process gone (crashed=${nativeEvent?.didCrash})`)
        }
        onContentProcessDidTerminate={() =>
          recover('content process terminated')
        }
        style={{ flex: 1 }}
      />
    </View>
  );
}
