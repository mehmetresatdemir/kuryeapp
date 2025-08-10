import "../global.css";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, Platform } from "react-native";
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { API_CONFIG } from '../constants/api';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Configure notification behavior - Show banner and play custom sound
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,   // Foreground'da banner göster
    shouldShowList: true,     // Notification listesine ekle
    shouldPlaySound: true,    // Custom ses çal
    shouldSetBadge: false,
  }),
});

// Ignore specific warnings
LogBox.ignoreLogs([
  'Warning: TNodeChildrenRenderer',
  'Warning: MemoizedTNodeRenderer',
  'Warning: TRenderEngineProvider',
]);

export default function RootLayout() {
  const [loaded] = useFonts({
    PlusJakartaSans: require("../assets/fonts/PlusJakartaSans-Regular.ttf"),
  });

  // Load polyfills safely after component mount
  useEffect(() => {
    const loadPolyfills = async () => {
      if (Platform.OS === 'android') {
        try {
          // Only load basic polyfills for Android
          await import('intl');
          await import('intl/locale-data/jsonp/tr');
          await import('intl/locale-data/jsonp/en');
          console.log('✅ Polyfills loaded successfully');
        } catch (error) {
          console.warn('⚠️ Polyfill loading skipped:', error.message);
          // App continues without polyfills - fallback methods will be used
        }
      }
    };
    
    loadPolyfills();
  }, []);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  // Setup notification channels for Android
  useEffect(() => {
    const setupNotificationChannels = async () => {
      if (Platform.OS === 'android') {
        try {
          // Mevcut channel'ı sil (eğer varsa) ve yeniden oluştur
          // Not: deleteNotificationChannelAsync API'si mevcut değilse skip et
          try {
            await Notifications.deleteNotificationChannelAsync('ring_bell2');
            console.log('🗑️ Existing ring_bell2 channel deleted');
          } catch (deleteError) {
            console.log('ℹ️ No existing ring_bell2 channel to delete');
          }

          // Ana notification channel
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
            sound: 'default',
          });

          // Ring Bell 2 için özel channel - yeniden oluştur
          await Notifications.setNotificationChannelAsync('ring_bell2', {
            name: 'Ring Bell 2 Notifications',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
            sound: 'ring_bell2', // Android raw resource name (no extension)
            enableLights: true,
            enableVibrate: true,
          });

          console.log('✅ Notification channels configured successfully');
        } catch (error) {
          console.error('❌ Error setting up notification channels:', error);
        }
      }
    };

    setupNotificationChannels();
  }, []);

  // Push notification setup - Unified notification service
  useEffect(() => {
    const setupPushNotifications = async () => {
      try {
        // Register for push notifications
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        
        if (finalStatus !== 'granted') {
          console.log('❌ Push notification permission denied');
          return;
        }
        
        // Get push token with project ID from API config
        const token = await Notifications.getExpoPushTokenAsync({
          projectId: Constants.expoConfig?.extra?.eas?.projectId || API_CONFIG.EXPO_PROJECT_ID
        });
        
        console.log('📱 Push token obtained:', token.data);
        
        // Store token in AsyncStorage for later registration
        await AsyncStorage.setItem('expoPushToken', token.data);
        
      } catch (error) {
        console.error('❌ Error setting up push notifications:', error);
      }
    };
    
    setupPushNotifications();
  }, []);

  // Listen for push notifications when app is running (foreground/background)
  useEffect(() => {
    const notificationListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('📱 Push notification received (app running):', notification);
      // This will be handled by the specific restaurant pages already
    });

    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('📱 Push notification tapped:', response);
      // Handle navigation based on notification type if needed
    });

    return () => {
      Notifications.removeNotificationSubscription(notificationListener);
      Notifications.removeNotificationSubscription(responseListener);
    };
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="kurye" options={{ headerShown: false }} />
      <Stack.Screen name="restaurant" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}