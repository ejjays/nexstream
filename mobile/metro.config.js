const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('mjs');

// ensure mp4 is treated as an asset, not source
config.resolver.assetExts = [...config.resolver.assetExts, 'mp4'];
config.resolver.sourceExts = config.resolver.sourceExts.filter(ext => ext !== 'mp4');

const skipNative = [
  /[/\\]node_modules[/\\].*[/\\]android[/\\].*/,
  /[/\\]node_modules[/\\].*[/\\]ios[/\\].*/,
  /[/\\]node_modules[/\\].*[/\\]cpp[/\\].*/,
  /[/\\]node_modules[/\\].*[/\\]windows[/\\].*/,
  /[/\\]node_modules[/\\]@react-native[/\\]gradle-plugin[/\\].*/,
];
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  ...skipNative,
];

config.transformer.minifierConfig = {
  ...config.transformer.minifierConfig,
  compress: {
    ...config.transformer.minifierConfig?.compress,
    drop_console: ['log', 'info', 'debug'],
  },
};

module.exports = config;
