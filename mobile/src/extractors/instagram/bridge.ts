type WebViewFetchResolver = (res: { ok: boolean; status: number; text: string }) => void;
const pendingRequests = new Map<
  string,
  {
    resolve: WebViewFetchResolver;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

let injectJS: ((js: string) => void) | null = null;
let webViewReady = false;

let resolveReady: () => void = () => {};
let readyPromise = new Promise<void>((resolve) => {
  resolveReady = resolve;
});

export function attachInstagramWebView(injector: (js: string) => void) {
  injectJS = injector;
  webViewReady = true;
  resolveReady();
}

export function resetInstagramReady(): void {
  webViewReady = false;
  readyPromise = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
}

export function onInstagramWebViewMessage(message: string) {
  try {
    const data = JSON.parse(message);
    if (data.type === 'ready') {
      webViewReady = true;
      resolveReady();
    } else if (data.type === 'fetchResult') {
      const pending = pendingRequests.get(data.reqId);
      if (pending) {
        pendingRequests.delete(data.reqId);
        clearTimeout(pending.timer);
        pending.resolve({
          ok: data.ok,
          status: data.status,
          text: data.text,
        });
      }
    } else if (data.log) {
      console.log('[InstagramWebView Log]', data.detail);
    }
  } catch (e) {
    console.error('Error parsing Instagram webview message:', e);
  }
}

export async function webviewFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const isReady = await Promise.race([
    readyPromise.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(webViewReady), 5000)),
  ]);

  if (!isReady) {
    throw new Error('Instagram WebView failed to boot in time');
  }

  const reqId = Math.random().toString(36).slice(2);
  const timeoutMs = 25000;

  return new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(reqId);
      reject(new Error(`Instagram webview fetch request timed out: ${url}`));
    }, timeoutMs);

    pendingRequests.set(reqId, {
      resolve: (result) => {
        resolve({
          ok: result.ok,
          status: result.status,
          text: () => Promise.resolve(result.text),
          json: () => {
            try {
              return Promise.resolve(JSON.parse(result.text));
            } catch (e) {
              return Promise.reject(e);
            }
          },
          headers: {
            get: () => null,
          },
        } as unknown as Response);
      },
      reject,
      timer,
    });

    const serializedInit = init
      ? {
          method: init.method,
          headers: init.headers,
          body: init.body,
        }
      : undefined;

    if (injectJS) {
      injectJS(
        `window.__webviewFetch(${JSON.stringify(reqId)}, ${JSON.stringify(url)}, ${JSON.stringify(serializedInit)});`
      );
    } else {
      pendingRequests.delete(reqId);
      clearTimeout(timer);
      reject(new Error('Instagram WebView is not mounted'));
    }
  });
}
