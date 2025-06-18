// MapView.web.js
import MapView from './MapView'; // Automatically resolves to MapView.web.js on the web
import React from 'react';
import { View, Text } from 'react-native';

const MapView = () => (
  <View>
    <Text>MapView is not supported on the web.</Text>
  </View>
);

export default MapView;