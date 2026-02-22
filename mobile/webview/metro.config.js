const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add support for .mjs which is used by modern libraries like lucide-react-native
config.resolver.sourceExts.push('mjs');

module.exports = config;