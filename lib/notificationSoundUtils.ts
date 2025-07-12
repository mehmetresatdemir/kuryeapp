import { Audio } from 'expo-av';
import { API_CONFIG, API_ENDPOINTS } from '../constants/api';

let soundObject: Audio.Sound | null = null;
let cachedActiveSound: any = null;

// Aktif bildirim sesini al
export const getActiveNotificationSound = async () => {
  try {
    const response = await fetch(`${API_CONFIG.BASE_URL}${API_ENDPOINTS.GET_ACTIVE_NOTIFICATION_SOUND}`);
    const data = await response.json();
    
    if (data.success && data.data) {
      return data.data;
    }
    return null;
  } catch (error) {
    console.error('Aktif bildirim sesi alınırken hata:', error);
    return null;
  }
};

// Bildirim sesini çal
export const playNotificationSound = async (soundData?: any) => {
  try {
    // Eğer önceki ses çalıyorsa durdur
    if (soundObject) {
      try {
        await soundObject.unloadAsync();
      } catch (error) {
        console.log('Önceki ses durdurulurken hata:', error);
      }
      soundObject = null;
    }

    // Eğer soundData yoksa önce cache'i kontrol et, sonra API'den al
    if (!soundData) {
      if (cachedActiveSound) {
        soundData = cachedActiveSound;
      } else {
        soundData = await getActiveNotificationSound();
        cachedActiveSound = soundData; // Cache'e kaydet
      }
    }

    if (!soundData?.file_path) {
      console.log('Bildirim sesi bulunamadı, varsayılan sesi kullan');
      // Varsayılan yerel sesi çal
      try {
        soundObject = new Audio.Sound();
        await soundObject.loadAsync(require('../assets/sounds/default-notification.wav'));
        await soundObject.playAsync();
        soundObject.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            soundObject?.unloadAsync();
            soundObject = null;
          }
        });
        return;
      } catch (defaultError) {
        console.error('Varsayılan bildirim sesi çalınamadı:', defaultError);
        return;
      }
    }

    // Ses dosyasının URL'ini oluştur
    const soundUrl = `${API_CONFIG.BASE_URL}${soundData.file_path}`;
    
    // Ses nesnesini oluştur ve çal
    soundObject = new Audio.Sound();
    
    await soundObject.loadAsync({ uri: soundUrl });
    await soundObject.playAsync();
    
    console.log(`✅ Bildirim sesi çalındı: ${soundData.name}`);
    
    // Ses bitince temizle
    soundObject.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        soundObject?.unloadAsync();
        soundObject = null;
      }
    });
    
  } catch (error) {
    console.error('Bildirim sesi çalınırken hata:', error);
    // Hata durumunda varsayılan bildirim sesini kullan
    try {
      if (soundObject) {
        await soundObject.unloadAsync();
        soundObject = null;
      }
    } catch (cleanupError) {
      console.log('Ses temizleme hatası:', cleanupError);
    }
  }
};

// Ses durdurma fonksiyonu
export const stopNotificationSound = async () => {
  try {
    if (soundObject) {
      await soundObject.stopAsync();
      await soundObject.unloadAsync();
      soundObject = null;
    }
  } catch (error) {
    console.error('Ses durdurulurken hata:', error);
  }
};

// Test ses çalma
export const testNotificationSound = async () => {
  const activeSound = await getActiveNotificationSound();
  if (activeSound) {
    await playNotificationSound(activeSound);
  }
};

// Cache'i güncelle (socket event'i geldiğinde kullanılır)
export const updateCachedSound = (soundData: any) => {
  cachedActiveSound = soundData;
  console.log(`🔄 Bildirim sesi cache'i güncellendi: ${soundData.soundName}`);
}; 