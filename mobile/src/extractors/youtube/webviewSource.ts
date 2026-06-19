/* runs inside webview; youtube.com origin dodges cors */
export const YT_EXTRACTOR_HTML = `<!doctype html>
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
<script type="module">
  const post = window.__post;
  const DEBUG = false;
  const log = (stage, detail) => {
    if (DEBUG) post({ log: true, stage, detail: String(detail) });
  };
  const warn = (stage, detail) => post({ log: true, stage, detail: String(detail) });
  const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';
  const CLIENTS = ['ANDROID_VR', 'IOS', 'WEB'];
  // detached window.fetch throws illegal invocation
  const httpFetch = (input, init) => fetch(input, init);

  let Innertube;
  let BG;

  async function boot() {
    log('import', 'youtubei start');
    ({ Innertube } = await import(
      'https://cdn.jsdelivr.net/npm/youtubei.js@17/bundle/browser.js'
    ));
    log('import', 'youtubei ok');
    try {
      ({ BG } = await import('https://esm.sh/bgutils-js@3.2.0?bundle'));
      log('import', 'bgutils ok');
    } catch (e) {
      warn('import', 'bgutils fail: ' + (e && e.message));
    }
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
    return out.poToken;
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

  async function extract(videoId, reqId) {
    let postedMeta = false;
    log('extract', 'boot innertube');
    const boot0 = await Innertube.create({ retrieve_player: false, fetch: httpFetch });
    const visitorData = boot0.session.context.client.visitorData;
    log('extract', 'visitorData ' + (visitorData ? 'ok' : 'missing'));

    let poToken;
    if (BG) {
      try {
        poToken = await makePoToken(visitorData);
        log('extract', 'potoken ' + (poToken ? 'ok len=' + poToken.length : 'none'));
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
    log('extract', 'player ' + (player ? 'ok' : 'missing'));

    let lastError = 'no clients';
    for (const client of CLIENTS) {
      try {
        log('getInfo', client + ' start');
        const info = await yt.getInfo(videoId, { client });
        if (!postedMeta) {
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
            postedMeta = true;
          }
        }
        const sd = info.streaming_data || {};
        const formats = await Promise.all(
          (sd.formats || []).map((f) => mapFormat(f, player))
        );
        const adaptive = await Promise.all(
          (sd.adaptive_formats || []).map((f) => mapFormat(f, player))
        );
        const usable = [...formats, ...adaptive].filter((x) => x.url);
        log(
          'getInfo',
          client + ' f=' + formats.length + ' a=' + adaptive.length + ' usable=' + usable.length
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
            poToken: Boolean(poToken),
            formats,
            adaptive,
          };
        }
        lastError = client + ': no usable urls (sabr?)';
      } catch (e) {
        lastError = client + ': ' + (e && e.message);
        warn('getInfo', lastError);
      }
    }
    throw new Error(lastError);
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
      const yt = await Innertube.create({ retrieve_player: false, fetch: httpFetch });
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
    .then(() => post({ ready: true }))
    .catch((e) => warn('boot', 'fail: ' + (e && e.message ? e.message : e)));
</script>
</body>
</html>`;
