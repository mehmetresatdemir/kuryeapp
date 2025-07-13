import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG, API_ENDPOINTS } from '../constants/api';
import { getActiveNotificationSound } from './notificationSoundUtils';

// Push notification token yönetimi
export class PushNotificationService {
  private static token: string | null = null;
  private static userId: string | null = null;
  private static userType: string | null = null;

  // Aktif bildirim sesini al
  static async getActiveSound(): Promise<string> {
    try {
      const activeSound = await getActiveNotificationSound();
      if (activeSound?.file_path) {
        // Backend'ten gelen path'i formatla
        const soundFileName = activeSound.file_path.split('/').pop() || 'default-notification.wav';
        // .wav uzantısı yoksa ekle
        return soundFileName.endsWith('.wav') ? soundFileName : `${soundFileName}.wav`;
      }
      return 'default-notification.wav';
    } catch (error) {
      console.error('Aktif ses alınırken hata:', error);
      return 'default-notification.wav';
    }
  }

  // Android notification channel'larını ayarla
  static async setupNotificationChannels() {
    if (Platform.OS === 'android') {
      // Aktif bildirim sesini al
      const activeSound = await this.getActiveSound();
      const soundName = activeSound; // Artık .wav uzantısı dahil geliyor
      
      console.log(`🔊 Android channel'lar için aktif ses: ${soundName}`);

      // Yeni siparişler için kanal
      await Notifications.setNotificationChannelAsync('new-orders', {
        name: 'Yeni Siparişler',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3B82F6',
        sound: soundName,
        enableVibrate: true,
        enableLights: true,
        showBadge: true,
      });

      // Sipariş durumu güncellemeleri için kanal
      await Notifications.setNotificationChannelAsync('order-updates', {
        name: 'Sipariş Güncellemeleri',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#10B981',
        sound: soundName,
        enableVibrate: true,
        enableLights: true,
        showBadge: true,
      });

      // Admin bildirimleri için kanal
      await Notifications.setNotificationChannelAsync('admin-notifications', {
        name: 'Yönetici Bildirimleri',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#F59E0B',
        sound: soundName,
        enableVibrate: true,
        enableLights: true,
        showBadge: true,
      });

      // Genel bildirimler için varsayılan kanal
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Genel Bildirimler',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6B7280',
        sound: soundName,
        enableVibrate: true,
        enableLights: true,
        showBadge: true,
      });
    }
  }

  // Expo push token'ını al ve backend'e kaydet
  static async registerForPushNotifications(userId: string, userType: 'restaurant' | 'courier') {
    try {
      console.log('🔔 Push notification kaydı başlatılıyor...');
      
      // Notification channel'larını ayarla
      await this.setupNotificationChannels();
      
      // Cihaz kontrolü
      if (!Device.isDevice) {
        console.log('⚠️ Push notification sadece gerçek cihazlarda çalışır');
        return null;
      }

      // Mevcut izinleri kontrol et
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // İzin yoksa iste
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
            allowDisplayInCarPlay: true,
            allowCriticalAlerts: true,
            provideAppNotificationSettings: true,
            allowProvisional: true,
          },
          android: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
            allowDisplayInCarPlay: true,
          },
        });
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('❌ Push notification izni reddedildi');
        return null;
      }

      console.log('✅ Push notification izni alındı');

      // Expo push token'ını al
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: '1a3e02ac-240c-48a3-b9e8-05dfc29cfe96', // app.json'dan
      });

      const token = tokenData.data;
      console.log('✅ Expo push token alındı:', token);

      // Token'ı sakla
      this.token = token;
      this.userId = userId;
      this.userType = userType;

      // Local storage'a da kaydet
      await AsyncStorage.setItem('pushToken', token);
      await AsyncStorage.setItem('pushTokenUserId', userId);
      await AsyncStorage.setItem('pushTokenUserType', userType);

      // Backend'e token'ı kaydet
      await this.savePushTokenToBackend(token, userId, userType);

      return token;
    } catch (error) {
      console.error('❌ Push notification kaydı hatası:', error);
      return null;
    }
  }

  // Token'ı backend'e kaydet
  private static async savePushTokenToBackend(token: string, userId: string, userType: string) {
    try {
      const url = `${API_CONFIG.BASE_URL}/api/push-token/register`;
      console.log('📤 PUSH SERVICE: Token backend\'e gönderiliyor...');
      console.log('📤 PUSH SERVICE: URL:', url);
      console.log('📤 PUSH SERVICE: API_CONFIG.BASE_URL:', API_CONFIG.BASE_URL);
      console.log('📤 PUSH SERVICE: Payload:', { token: token.substring(0, 20) + '...', userId, userType, platform: Platform.OS });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          userId,
          userType,
          platform: Platform.OS,
        }),
      });

      console.log('📥 PUSH SERVICE: Response status:', response.status);
      console.log('📥 PUSH SERVICE: Response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ PUSH SERVICE: HTTP hatası:', response.status, errorText);
        return;
      }

      const result = await response.json();
      console.log('📥 PUSH SERVICE: Response body:', result);
      
      if (result.success) {
        console.log('✅ PUSH SERVICE: Token backend\'e kaydedildi');
      } else {
        console.error('❌ PUSH SERVICE: Token kaydetme hatası:', result.message);
      }
    } catch (error) {
      console.error('❌ PUSH SERVICE: Backend kaydetme hatası:', error);
      console.error('❌ PUSH SERVICE: Hata detayı:', (error as Error).message);
      console.error('❌ PUSH SERVICE: Hata stack:', (error as Error).stack);
    }
  }

  // Token'ı güncelle (uygulama her açıldığında çağrılmalı)
  static async updatePushToken(userId: string, userType: 'restaurant' | 'courier') {
    try {
      // Önceki token'ı kontrol et
      const storedToken = await AsyncStorage.getItem('pushToken');
      const storedUserId = await AsyncStorage.getItem('pushTokenUserId');
      const storedUserType = await AsyncStorage.getItem('pushTokenUserType');

      // Kullanıcı değişmişse veya token yoksa yeni token al
      if (!storedToken || storedUserId !== userId || storedUserType !== userType) {
        console.log('🔄 Push token güncelleniyor...');
        return await this.registerForPushNotifications(userId, userType);
      }

      // Mevcut token'ı doğrula ve backend'e gönder
      this.token = storedToken;
      this.userId = userId;
      this.userType = userType;

      await this.savePushTokenToBackend(storedToken, userId, userType);
      console.log('✅ Mevcut push token doğrulandı');
      
      return storedToken;
    } catch (error) {
      console.error('❌ Push token güncelleme hatası:', error);
      return null;
    }
  }

  // Token'ı kaldır (logout'ta kullanılır)
  static async unregisterPushToken() {
    try {
      if (this.token && this.userId && this.userType) {
        // Backend'ten token'ı kaldır
        await fetch(`${API_CONFIG.BASE_URL}/api/push-token/unregister`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token: this.token,
            userId: this.userId,
            userType: this.userType,
          }),
        });
      }

      // Local storage'ı temizle
      await AsyncStorage.removeItem('pushToken');
      await AsyncStorage.removeItem('pushTokenUserId');
      await AsyncStorage.removeItem('pushTokenUserType');

      // Memory'yi temizle
      this.token = null;
      this.userId = null;
      this.userType = null;

      console.log('✅ Push token kaydı kaldırıldı');
    } catch (error) {
      console.error('❌ Push token kaldırma hatası:', error);
    }
  }

  // Mevcut token'ı al
  static getCurrentToken(): string | null {
    return this.token;
  }
}

// Notification handler'ı yapılandır - Background için kritik
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    console.log('📱 Notification received:', notification);
    console.log('📱 Notification content:', notification.request.content);
    
    // Aktif bildirim sesini al
    const activeSound = await PushNotificationService.getActiveSound();
    console.log('🔊 Bildirim için aktif ses:', activeSound);
    
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
  console.log('📱 Background notification response:', response);
  
  const data = response.notification.request.content.data;
  
  // Bildirime tıklandığında uygulama içi navigasyon yapılabilir
  if (data?.orderId) {
    // Sipariş detayına yönlendir
    console.log('🔄 Sipariş detayına yönlendiriliyor:', data.orderId);
  }
  
  if (data?.type === 'admin_notification') {
    console.log('🔄 Admin bildirimi açıldı');
  }
});

// Foreground notification listener
Notifications.addNotificationReceivedListener(notification => {
  console.log('📱 Foreground notification received:', notification);
});

export default PushNotificationService; 