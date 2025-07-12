import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../constants/api';

// Push notification token yönetimi
export class PushNotificationService {
  private static token: string | null = null;
  private static userId: string | null = null;
  private static userType: string | null = null;

  // Expo push token'ını al ve backend'e kaydet
  static async registerForPushNotifications(userId: string, userType: 'restaurant' | 'courier') {
    try {
      console.log('🔔 Push notification kaydı başlatılıyor...');
      
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
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('❌ Push notification izni reddedildi');
        return null;
      }

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
      console.log('📤 Push token gönderiliyor URL:', url);
      console.log('📤 Push token payload:', { token: token.substring(0, 20) + '...', userId, userType, platform: Platform.OS });
      
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

      console.log('📥 Push token response status:', response.status);
      console.log('📥 Push token response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Push token HTTP hatası:', response.status, errorText);
        return;
      }

      const result = await response.json();
      
      if (result.success) {
        console.log('✅ Push token backend\'e kaydedildi');
      } else {
        console.error('❌ Push token kaydetme hatası:', result.message);
      }
    } catch (error) {
      console.error('❌ Backend push token kaydetme hatası:', error);
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

// Notification handler'ı yapılandır
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
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
});

export default PushNotificationService; 