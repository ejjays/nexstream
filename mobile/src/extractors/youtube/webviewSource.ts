/* runs inside webview; youtube.com origin dodges cors */
const RAW_HTML = `<!doctype html>
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
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    window.__post({ log: true, stage: 'reject', detail: String((r && r.message) || r) });
  });
</script>
<script>
  const post = window.__post;
  const DEBUG = false;
  const log = (stage, detail) => {
    if (DEBUG) post({ log: true, stage, detail: String(detail) });
  };
  const warn = (stage, detail) => post({ log: true, stage, detail: String(detail) });
  warn('wv', 'script start');
  const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';
  const CLIENTS = ['ANDROID_VR', 'IOS', 'TV', 'WEB'];
  // arm once, reuse for hours
  const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
  const REFRESH_MARGIN_MS = 5 * 60 * 1000;
  // detached window.fetch throws illegal invocation
  // innertube api -> RN native fetch (no browser fingerprint, dodges bot wall);
  // static assets (player base.js) stay in-browser
  const rnFetches = {};
  window.__rnFetchResponse = (reqId, payload) => {
    const waiter = rnFetches[reqId];
    if (!waiter) return;
    delete rnFetches[reqId];
    if (!payload || !payload.ok) {
      waiter.reject(new Error((payload && payload.error) || 'rn fetch failed'));
      return;
    }
    waiter.resolve(
      new Response(payload.body, {
        status: payload.status || 200,
        headers: payload.headers || {},
      })
    );
  };
  const httpFetch = async (input, init) => {
    const raw = typeof input === 'string' ? input : (input && input.url) || '';
    if (raw.indexOf('/youtubei/') === -1) return fetch(input, init);
    const request = new Request(input, init);
    const headers = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    let body;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = await request.text();
    }
    const reqId = Date.now() + '_' + Math.random().toString(36).slice(2);
    return new Promise((resolve, reject) => {
      rnFetches[reqId] = { resolve, reject };
      post({
        rnFetch: true,
        reqId,
        url: request.url,
        method: request.method,
        headers,
        body,
      });
    });
  };

  let Innertube;
  let BG;
  let armed = null;
  let arming = null;
  let searchClient = null;
  let searchClientP = null;

  function importWithTimeout(url, ms) {
    return Promise.race([
      import(url),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), ms)
      ),
    ]);
  }

  // cdn imports flaky; try mirrors, long timeout
  async function importFirst(urls, label) {
    let lastErr;
    for (const url of urls) {
      try {
        return await importWithTimeout(url, 25000);
      } catch (e) {
        lastErr = e;
        warn('import', label + ' miss: ' + (e && e.message));
      }
    }
    throw lastErr || new Error(label + ' failed');
  }

  async function boot() {
    warn('import', 'youtubei start');
    const ytMod = await importFirst(
      [
        'https://cdn.jsdelivr.net/npm/youtubei.js@17/bundle/browser.js',
        'https://unpkg.com/youtubei.js@17/bundle/browser.js',
        'https://esm.sh/youtubei.js@17?bundle',
      ],
      'youtubei'
    );
    Innertube = ytMod.Innertube;
    warn('import', 'youtubei ok');
  }

  // bgutils only needed for extraction
  async function ensureBG() {
    if (BG) return BG;
    try {
      const bgMod = await importFirst(
        [
          'https://esm.sh/bgutils-js@3.2.0?bundle',
          'https://cdn.jsdelivr.net/npm/bgutils-js@3.2.0/+esm',
        ],
        'bgutils'
      );
      BG = bgMod.BG;
      warn('import', 'bgutils ok');
    } catch (e) {
      warn('import', 'bgutils fail: ' + (e && e.message));
    }
    return BG;
  }

  async function makePoToken(visitorData) {
    const bgConfig = {
      fetch: (...a) => fetch(...a),
      globalObj: window,
      identifier: visitorData,
      requestKey: REQUEST_KEY,
    };
    const challenge = await BG.Challenge.create(bgConfig);
    if (!challenge) throw new Error('challenge empty');
    const script =
      challenge.interpreterJavascript.privateDoNotAccessOrElseSafeScriptWrappedValue;
    if (script) new Function(script)();
    const out = await BG.PoToken.generate({
      program: challenge.program,
      globalName: challenge.globalName,
      bgConfig,
    });
    const ttlSecs =
      out.integrityTokenData && out.integrityTokenData.estimatedTtlSecs;
    return { poToken: out.poToken, ttlMs: ttlSecs ? ttlSecs * 1000 : 0 };
  }

  function extractUrl(value) {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      if (typeof value.href === 'string' && value.href.indexOf('http') === 0)
        return value.href;
      if (typeof value.url === 'string' && value.url.indexOf('http') === 0)
        return value.url;
      const s = String(value);
      if (s.indexOf('http') === 0) return s;
    }
    return undefined;
  }
  async function mapFormat(f, player) {
    let url = typeof f.url === 'string' ? f.url : undefined;
    let deciphered;
    try {
      if (player) deciphered = await f.decipher(player);
    } catch (e) {
      deciphered = undefined;
    }
    const fast = extractUrl(deciphered);
    if (typeof fast === 'string') url = fast;
    return {
      itag: f.itag,
      url,
      mimeType: f.mime_type,
      width: f.width,
      height: f.height,
      bitrate: f.bitrate,
      qualityLabel: f.quality_label,
      hasAudio: f.has_audio,
      hasVideo: f.has_video,
      contentLength: f.content_length,
      audioQuality: f.audio_quality,
      language: f.language,
      isOriginal: f.is_original,
    };
  }

  async function armClient() {
    log('arm', 'boot innertube');
    const boot0 = await Innertube.create({
      retrieve_player: false,
      fetch: httpFetch,
    });
    const visitorData = boot0.session.context.client.visitorData;
    log('arm', 'visitorData ' + (visitorData ? 'ok' : 'missing'));

    let poToken;
    let ttlMs = 0;
    // no cookie; a login gates music audio
    const bg = await ensureBG();
    if (bg) {
      try {
        const tok = await makePoToken(visitorData);
        poToken = tok.poToken;
        ttlMs = tok.ttlMs;
        log('arm', 'potoken ' + (poToken ? 'ok len=' + poToken.length : 'none'));
      } catch (e) {
        warn('potoken', e && e.message);
      }
    }

    const yt = await Innertube.create({
      po_token: poToken,
      visitor_data: visitorData,
      generate_session_locally: true,
      fetch: httpFetch,
    });
    const player = yt.session.player;
    log('arm', 'player ' + (player ? 'ok' : 'missing'));
    const lifeMs = ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS;
    return {
      yt,
      player,
      poToken,
      visitorData,
      expiresAt: Date.now() + Math.max(lifeMs - REFRESH_MARGIN_MS, 60000),
    };
  }

  // cached client; refresh on expiry
  function getArmedClient() {
    if (armed && Date.now() < armed.expiresAt) return Promise.resolve(armed);
    if (arming) return arming;
    arming = armClient()
      .then((bundle) => {
        armed = bundle;
        return bundle;
      })
      .finally(() => {
        arming = null;
      });
    return arming;
  }

  // reused lightweight search session
  function getSearchClient() {
    if (searchClient) return Promise.resolve(searchClient);
    if (searchClientP) return searchClientP;
    searchClientP = Innertube.create({
      retrieve_player: false,
      fetch: httpFetch,
    })
      .then((client) => {
        searchClient = client;
        return client;
      })
      .finally(() => {
        searchClientP = null;
      });
    return searchClientP;
  }

  async function extractWith(videoId, reqId, bundle, meta) {
    const yt = bundle.yt;
    const player = bundle.player;
    let lastError = 'no clients';
    let loginRequired = false;
    for (const client of CLIENTS) {
      try {
        log('getInfo', client + ' start');
        const info = await yt.getInfo(videoId, { client });
        if (!meta.posted) {
          const bi = info.basic_info || {};
          if (bi.title) {
            post({
              reqId,
              partial: true,
              meta: {
                id: videoId,
                title: bi.title,
                author: bi.author,
                duration: bi.duration,
                thumbnail: (bi.thumbnail && bi.thumbnail[0] && bi.thumbnail[0].url) || undefined,
              },
            });
            meta.posted = true;
          }
        }
        const sd = info.streaming_data || {};
        const ps = info.playability_status || {};
        const formats = await Promise.all(
          (sd.formats || []).map((f) => mapFormat(f, player))
        );
        const adaptive = await Promise.all(
          (sd.adaptive_formats || []).map((f) => mapFormat(f, player))
        );
        const usable = [...formats, ...adaptive].filter((x) => x.url);
        log(
          'getInfo',
          client + ' f=' + formats.length + ' a=' + adaptive.length + ' usable=' + usable.length + ' play=' + (ps.status || '?')
        );
        if (usable.length > 0) {
          const b = info.basic_info || {};
          return {
            id: videoId,
            title: b.title,
            author: b.author,
            duration: b.duration,
            thumbnail: (b.thumbnail && b.thumbnail[0] && b.thumbnail[0].url) || undefined,
            client,
            poToken: Boolean(bundle.poToken),
            formats,
            adaptive,
          };
        }
        if (ps.status === 'LOGIN_REQUIRED') {
          loginRequired = true;
          lastError = ps.reason || 'Sign in to confirm you are not a bot';
        } else {
          lastError = client + ': no usable urls (sabr?)';
        }
      } catch (e) {
        lastError = client + ': ' + (e && e.message);
        warn('getInfo', lastError);
      }
    }
    const err = new Error(
      loginRequired ? 'YouTube needs sign-in: ' + lastError : lastError
    );
    err.loginRequired = loginRequired;
    throw err;
  }

  async function extract(videoId, reqId) {
    const meta = { posted: false };
    const bundle = await getArmedClient();
    try {
      return await extractWith(videoId, reqId, bundle, meta);
    } catch (e) {
      // stale client: re-arm once
      if (!e.loginRequired && armed === bundle) {
        warn('extract', 're-arm after: ' + (e && e.message));
        armed = null;
        const fresh = await getArmedClient();
        return await extractWith(videoId, reqId, fresh, meta);
      }
      throw e;
    }
  }

  async function postEarlyMeta(reqId, videoId) {
    try {
      const target = encodeURIComponent(
        'https://www.youtube.com/watch?v=' + videoId
      );
      const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + target);
      if (!r.ok) return;
      const j = await r.json();
      post({
        reqId,
        partial: true,
        meta: {
          id: videoId,
          title: j.title,
          author: j.author_name,
          thumbnail: j.thumbnail_url,
        },
      });
    } catch (e) {
      log('oembed', 'fail: ' + (e && e.message));
    }
  }

  window.__search = async (reqId, query) => {
    try {
      const yt = await getSearchClient();
      const res = await yt.search(query, { type: 'video' });
      const list = res.videos || res.results || [];
      const results = list
        .map((v) => ({
          id: v.id || v.video_id,
          title: (v.title && (v.title.text || v.title)) || undefined,
          author: (v.author && (v.author.name || v.author)) || undefined,
          durationSec:
            (v.duration && v.duration.seconds) || v.length_seconds || undefined,
        }))
        .filter((v) => v.id)
        .slice(0, 8);
      post({ reqId, search: true, ok: true, results });
    } catch (e) {
      post({ reqId, search: true, ok: false, error: String((e && e.message) || e) });
    }
  };

  window.__extract = async (reqId, videoId) => {
    postEarlyMeta(reqId, videoId);
    try {
      const data = await extract(videoId, reqId);
      post({ reqId, ok: true, data });
    } catch (e) {
      post({ reqId, ok: false, error: String((e && e.message) || e) });
    }
  };

  boot()
    .then(() => {
      post({ ready: true });
      // warm search; skip the first-search wait
      getSearchClient().catch((e) => warn('warm', e && e.message));
    })
    .catch((e) => warn('boot', 'fail: ' + (e && e.message ? e.message : e)));
</script>
</body>
</html>`;

// android ignores inline scripts; inject on load
const SCRIPTS = [...RAW_HTML.matchAll(/<script>([\s\S]*?)<\/script>/gu)]
  .map((match) => match[1])
  .join('\n');

export const YT_BOOTSTRAP_JS = `(function () {
  if (window.__nexBooted) return;
  window.__nexBooted = true;
${SCRIPTS}
})();
true;`;

// page is empty; bootstrap injected after load
export const YT_EXTRACTOR_HTML = `<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body></body>
</html>`;
