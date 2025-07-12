import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

export interface ImagePickerOptions {
  allowsEditing?: boolean;
  quality?: number;
  aspect?: [number, number];
  base64?: boolean;
  exif?: boolean;
}

export interface ImagePickerResult {
  success: boolean;
  uri?: string;
  error?: string;
}

// Güvenli galeri erişimi
export const pickImageFromGallery = async (options: ImagePickerOptions = {}): Promise<ImagePickerResult> => {
  try {
    // Önce mevcut izinleri kontrol et
    const { status: existingStatus } = await ImagePicker.getMediaLibraryPermissionsAsync();
    
    let finalStatus = existingStatus;
    
    // Eğer izin yoksa talep et
    if (existingStatus !== 'granted') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      Alert.alert(
        'Galeri İzni Gerekli',
        'Galeriden resim seçebilmek için galeri iznine ihtiyacımız var. Lütfen ayarlardan izin verin.',
        [
          { text: 'İptal', style: 'cancel' },
          { text: 'Tamam', style: 'default' }
        ]
      );
      return { success: false, error: 'Permission denied' };
    }

    // ImagePicker'ı başlat
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: options.allowsEditing ?? true,
      quality: options.quality ?? 0.4,
      base64: options.base64 ?? false,
      exif: options.exif ?? false,
      ...(options.aspect && { aspect: options.aspect }),
    });

    if (result.canceled) {
      return { success: false, error: 'User cancelled' };
    }

    if (!result.assets || result.assets.length === 0) {
      return { success: false, error: 'No image selected' };
    }

    const asset = result.assets[0];
    if (!asset.uri) {
      return { success: false, error: 'Invalid image URI' };
    }

    return { success: true, uri: asset.uri };
  } catch (error) {
    console.error('Gallery picker error:', error);
    Alert.alert('Hata', 'Resim seçilirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.');
    return { success: false, error: String(error) };
  }
};

// Güvenli kamera erişimi
export const takePhotoFromCamera = async (options: ImagePickerOptions = {}): Promise<ImagePickerResult> => {
  try {
    // Önce mevcut kamera izinlerini kontrol et
    const { status: existingStatus } = await ImagePicker.getCameraPermissionsAsync();
    
    let finalStatus = existingStatus;
    
    // Eğer izin yoksa talep et
    if (existingStatus !== 'granted') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      Alert.alert(
        'Kamera İzni Gerekli',
        'Fotoğraf çekebilmek için kamera iznine ihtiyacımız var. Lütfen ayarlardan izin verin.',
        [
          { text: 'İptal', style: 'cancel' },
          { text: 'Tamam', style: 'default' }
        ]
      );
      return { success: false, error: 'Permission denied' };
    }

    // Kamerayı başlat
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: options.allowsEditing ?? true,
      quality: options.quality ?? 0.4,
      base64: options.base64 ?? false,
      exif: options.exif ?? false,
      ...(options.aspect && { aspect: options.aspect }),
    });

    if (result.canceled) {
      return { success: false, error: 'User cancelled' };
    }

    if (!result.assets || result.assets.length === 0) {
      return { success: false, error: 'No photo taken' };
    }

    const asset = result.assets[0];
    if (!asset.uri) {
      return { success: false, error: 'Invalid photo URI' };
    }

    return { success: true, uri: asset.uri };
  } catch (error) {
    console.error('Camera picker error:', error);
    Alert.alert('Hata', 'Fotoğraf çekilirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.');
    return { success: false, error: String(error) };
  }
};

// Resim seçim modal'ı
export const showImagePickerModal = (onGalleryPress: () => void, onCameraPress: () => void) => {
  Alert.alert(
    'Resim Seç',
    'Bir seçenek belirleyin',
    [
      { text: 'Galeriden Seç', onPress: onGalleryPress },
      { text: 'Fotoğraf Çek', onPress: onCameraPress },
      { text: 'İptal', style: 'cancel' },
    ]
  );
}; 