const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('mjs');

// proot inotify cap — skip native module dirs
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

module.exports = config;
