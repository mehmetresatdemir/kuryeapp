// metro.config.js

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname, {
  // true olarak ayarlandığında, Metro'nun sembolik bağlantıları çözümlemesini sağlar.
  // Bu, monorepos gibi senaryolar için kullanışlı olabilir.
  isCSSEnabled: true,
});

// Backend klasörünü Metro bundler'dan hariç tut
config.resolver.blockList = [
  /backend\/.*/,
  /node_modules\/.*\/backend\/.*/,
];

// Watchman'a backend klasörünü ignore et
config.watchFolders = [
  path.resolve(__dirname, './app'),
  path.resolve(__dirname, './components'),
  path.resolve(__dirname, './lib'),
  path.resolve(__dirname, './constants'),
  path.resolve(__dirname, './assets'),
];

// SVG dosyalarını bir React bileşeni olarak içe aktarabilmek için
// Metro'nun varsayılan 'assetExts' yapılandırmasını genişletin.
// Bu, 'react-native-svg-transformer'ın SVG'leri işlemesine olanak tanır.
config.resolver.assetExts = config.resolver.assetExts.filter(
  (ext) => ext !== 'svg'
);

// Metro'nun kaynak uzantıları listesinin başına 'svg' ekleyin.
// Bu, '.svg' dosyalarının bir modül olarak tanınmasını sağlar.
config.resolver.sourceExts.push('svg');

// Add path alias resolution
config.resolver.alias = {
  '@': path.resolve(__dirname, './'),
};

// Try to use SVG transformer if available, otherwise use default
try {
  config.transformer.babelTransformerPath = require.resolve(
    'react-native-svg-transformer'
  );
} catch (error) {
  console.warn('react-native-svg-transformer not found, using default transformer');
}

module.exports = config;