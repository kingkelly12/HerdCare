module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      ['inline-import', { extensions: ['.sql'] }],
      // Reanimated 4 moved the worklet transform here; `react-native-reanimated/plugin` is now
      // only a shim that re-exports it. Must stay last.
      'react-native-worklets/plugin',
    ],
  };
};
