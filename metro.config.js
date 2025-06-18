const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Web desteğini devre dışı bırak
config.resolver.platforms = ['ios', 'android'];

module.exports = config;