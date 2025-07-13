import "../global.css";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox } from "react-native";
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import PushNotificationService from '../lib/pushNotificationService';
import { playNotificationSound } from '../lib/notificationSoundUtils';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Background notification handler'ı global olarak ayarla
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    console.log('📱 Background notification received in _layout:', notification);
    
    // Background'da bile bildirim göster
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

// Background notification response handler
Notifications.addNotificationResponseReceivedListener(response => {
  console.log('📱 Background notification clicked in _layout:', response);
  
  const data = response.notification.request.content.data;
  
  // Bildirime tıklandığında navigasyon yapılabilir
  if (data?.orderId) {
    console.log('🔄 Sipariş detayına yönlendiriliyor:', data.orderId);
    // Burada router.push ile navigasyon yapılabilir
  }
  
  if (data?.type === 'admin_notification') {
    console.log('🔄 Admin bildirimi açıldı');
  }
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

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  // Push notification setup
  useEffect(() => {
    const setupPushNotifications = async () => {
      try {
        // Notification channel'larını ayarla
        await PushNotificationService.setupNotificationChannels();
        console.log('✅ Notification channels setup completed');
        
        // Bildirim sesini test et (sadece development mode'da)
        if (__DEV__) {
          setTimeout(async () => {
            try {
              console.log('🔊 Bildirim sesi test ediliyor...');
              await playNotificationSound();
              console.log('✅ Bildirim sesi test tamamlandı');
            } catch (soundError) {
              console.error('❌ Bildirim sesi test hatası:', soundError);
            }
          }, 2000);
        }
        
      } catch (error) {
        console.error('❌ Push notification setup error:', error);
      }
    };

    setupPushNotifications();
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="restaurant" options={{ headerShown: false }} />
      <Stack.Screen name="kurye" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}