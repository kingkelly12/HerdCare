const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Drizzle migrations are shipped as .sql files and imported directly.
config.resolver.sourceExts.push('sql');
// expo-sqlite's web (wasm/OPFS) backend needs .wasm resolvable as an asset.
config.resolver.assetExts.push('wasm');

// tweetnacl, which verifies licence codes offline, reaches for Node's `crypto` at load time.
// Nothing on the phone needs it — see lib/license/nodeCryptoShim.js — so resolve it to an empty
// module deliberately instead of leaving a Node builtin to chance inside a React Native bundle.
const nodeCryptoShim = require.resolve('./lib/license/nodeCryptoShim.js');
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'crypto') {
    return { type: 'sourceFile', filePath: nodeCryptoShim };
  }
  return upstreamResolveRequest
    ? upstreamResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
