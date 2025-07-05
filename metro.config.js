const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Web desteğini devre dışı bırak
config.resolver.platforms = ['ios', 'android'];

module.exports = withNativeWind(config, { input: './global.css' });