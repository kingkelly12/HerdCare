const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Drizzle migrations are shipped as .sql files and imported directly.
config.resolver.sourceExts.push('sql');
// expo-sqlite's web (wasm/OPFS) backend needs .wasm resolvable as an asset.
config.resolver.assetExts.push('wasm');

module.exports = withNativeWind(config, { input: './global.css' });
