import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../constants/api';
import io from 'socket.io-client';

// Task adı
const BACKGROUND_LOCATION_TASK = 'background-location-task';

// Socket referansı
let backgroundSocket: any = null;

// Background location task tanımı
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, ({ data, error }: any) => {
  if (error) {
    console.error('❌ Background location error:', error);
    return;
  }

  if (data) {
    const { locations } = data;
    console.log('📍 Background location update:', locations);
    
    // Konum verilerini işle
    handleBackgroundLocationUpdate(locations);
  }
});

// Background location güncellemelerini işle
const handleBackgroundLocationUpdate = async (locations: Location.LocationObject[]) => {
  try {
    if (!locations || locations.length === 0) return;

    const location = locations[0];
    const userData = await AsyncStorage.getItem('userData');
    const activeOrdersData = await AsyncStorage.getItem('kurye_active_orders');
    
    if (!userData || !activeOrdersData) {
      console.log('📵 Background: Kullanıcı verisi veya aktif sipariş bulunamadı');
      return;
    }

    const user = JSON.parse(userData);
    const activeOrders = JSON.parse(activeOrdersData);

    if (!activeOrders || activeOrders.length === 0) {
      console.log('📵 Background: Aktif sipariş yok, konum gönderilmiyor');
      return;
    }

    // Socket bağlantısını kur/kontrol et
    if (!backgroundSocket || !backgroundSocket.connected) {
      backgroundSocket = io(API_CONFIG.SOCKET_URL, { 
        transports: ["websocket"],
        timeout: 5000 
      });
    }

    // Her aktif sipariş için konum gönder
    const timestamp = new Date().toISOString();
    activeOrders.forEach((order: any) => {
      if (backgroundSocket && backgroundSocket.connected) {
        const locationData = {
          courierId: user.id,
          orderId: order.id,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          firmaid: order.firmaid || user.id,
          accuracy: location.coords.accuracy,
          timestamp: timestamp,
          speed: location.coords.speed || 0,
          heading: location.coords.heading || 0,
          source: 'background' // Background'dan geldiğini belirt
        };
        
        backgroundSocket.emit("locationUpdate", locationData);
        console.log(`📍 Background: Konum gönderildi - Sipariş: ${order.id}`);
      }
    });

    // Son konum güncellemesi zamanını kaydet
    await AsyncStorage.setItem('last_background_location_update', timestamp);

  } catch (error) {
    console.error('❌ Background location processing error:', error);
  }
};

// Background location tracking'i başlat
export const startBackgroundLocationTracking = async (): Promise<boolean> => {
  try {
    // İzinleri kontrol et
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      console.error('❌ Foreground location permission denied');
      return false;
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      console.error('❌ Background location permission denied');
      return false;
    }

    // Task zaten kayıtlı mı kontrol et
    const isTaskDefined = TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK);
    if (!isTaskDefined) {
      console.error('❌ Background location task not defined');
      return false;
    }

    // Background location tracking'i başlat
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced, // Battery-friendly
      timeInterval: 10000, // 10 saniyede bir
      distanceInterval: 10, // 10 metre hareket ettiğinde
      foregroundService: {
        notificationTitle: "KuryeX - Aktif Teslimat",
        notificationBody: "Sipariş teslimatınız takip ediliyor",
        notificationColor: "#8B5CF6",
      },
      pausesUpdatesAutomatically: false, // Otomatik durmasın
      showsBackgroundLocationIndicator: true, // iOS için konum göstergesi
    });

    console.log('✅ Background location tracking başlatıldı');
    return true;

  } catch (error) {
    console.error('❌ Background location tracking başlatma hatası:', error);
    return false;
  }
};

// Background location tracking'i durdur
export const stopBackgroundLocationTracking = async (): Promise<void> => {
  try {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      console.log('🛑 Background location tracking durduruldu');
    }

    // Socket bağlantısını kapat
    if (backgroundSocket) {
      backgroundSocket.disconnect();
      backgroundSocket = null;
    }

  } catch (error) {
    console.error('❌ Background location tracking durdurma hatası:', error);
  }
};

// Background location tracking durumunu kontrol et
export const isBackgroundLocationTrackingActive = async (): Promise<boolean> => {
  try {
    return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  } catch (error) {
    console.error('❌ Background tracking status check error:', error);
    return false;
  }
};

// Aktif siparişleri background için kaydet
export const saveActiveOrdersForBackground = async (orders: any[]): Promise<void> => {
  try {
    await AsyncStorage.setItem('kurye_active_orders', JSON.stringify(orders));
    console.log(`💾 Background için ${orders.length} aktif sipariş kaydedildi`);
  } catch (error) {
    console.error('❌ Active orders save error:', error);
  }
};

// Background location servis durumunu kontrol et
export const getBackgroundLocationStatus = async () => {
  try {
    const isActive = await isBackgroundLocationTrackingActive();
    const lastUpdate = await AsyncStorage.getItem('last_background_location_update');
    const activeOrders = await AsyncStorage.getItem('kurye_active_orders');
    
    return {
      isActive,
      lastUpdate,
      activeOrdersCount: activeOrders ? JSON.parse(activeOrders).length : 0,
      taskDefined: TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)
    };
  } catch (error) {
    console.error('❌ Background status check error:', error);
    return {
      isActive: false,
      lastUpdate: null,
      activeOrdersCount: 0,
      taskDefined: false
    };
  }
};
