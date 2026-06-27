const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

// raises heap cap so parallel chunks beside webview avoid oom
const withLargeHeap = (config) =>
  withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(
      cfg.modResults
    );
    app.$['android:largeHeap'] = 'true';
    return cfg;
  });

module.exports = withLargeHeap;
