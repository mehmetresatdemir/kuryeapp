import { Platform } from 'react-native';

let MapView;
if (Platform.OS === 'ios' || Platform.OS === 'android') {
  MapView = require('react-native-maps').default;
} else {
  // Provide a fallback or mock component for the web
  MapView = () => null;
}

// Use MapView in your component
const MyComponent = () => {
  return (
    <View>
      {Platform.OS !== 'web' && <MapView />}
    </View>
  );
};