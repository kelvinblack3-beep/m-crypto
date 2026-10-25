const path = require('path');

const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

// Web swaps for native-only modules. react-native-pulsar reads
// `TurboModuleRegistry.getEnforcing('RNPulsar')` at module scope, and
// react-native-web has no TurboModuleRegistry, so importing it on web threw
// before the app rendered. Redirected here rather than at each import site
// because new screens import the package directly.
const WEB_MODULE_SHIMS = {
  'react-native-pulsar': path.resolve(__dirname, 'shims/react-native-pulsar.web.ts'),
};

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const shim = platform === 'web' ? WEB_MODULE_SHIMS[moduleName] : undefined;
  if (shim) return { type: 'sourceFile', filePath: shim };
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
});
