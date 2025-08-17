import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from "expo-router";
import { getFullUrl, API_ENDPOINTS, authedFetch } from "../../constants/api";
import Constants from 'expo-constants';
import Slider from '@react-native-community/slider';
import MapView, { Marker, Circle } from 'react-native-maps';
import * as Location from 'expo-location';

interface UserData {
  id: string;
  name: string;
  email: string;
  phone: string;
  password?: string;
  is_blocked: boolean;
  is_online: boolean;
  package_limit: number;
  total_earnings: number;
  total_deliveries: number;
  last_activity: string;
  last_seen: string;
  created_at: string;
  updated_at: string;
  avg_delivery_time_minutes?: number;
  home_latitude?: number;
  home_longitude?: number;
  km_radius?: number;
}

const KuryeProfile = () => {
  const [userData, setUserData] = useState<UserData>({
    id: "",
    name: "",
    email: "",
    phone: "",
    is_blocked: false,
    is_online: false,
    package_limit: 5,
    total_earnings: 0,
    total_deliveries: 0,
    last_activity: "",
    last_seen: "",
    created_at: "",
    updated_at: "",
    avg_delivery_time_minutes: 0,
    home_latitude: undefined,
    home_longitude: undefined,
    km_radius: 10,
  });
  const [loading, setLoading] = useState(true);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [preferencesModalVisible, setPreferencesModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Preferences states
  const [notificationMode, setNotificationMode] = useState<'all_restaurants' | 'selected_restaurants'>('all_restaurants');
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [selectedRestaurants, setSelectedRestaurants] = useState<number[]>([]);
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  
  // Content pages state
  const [contentPages, setContentPages] = useState<any>({});
  
  // Report issue states
  const [reportIssueModalVisible, setReportIssueModalVisible] = useState(false);
  const [reportTitle, setReportTitle] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportPriority, setReportPriority] = useState<'low' | 'medium' | 'high'>('medium');
  
  const [editUserData, setEditUserData] = useState<UserData>({
    id: "",
    name: "",
    email: "",
    phone: "",
    is_blocked: false,
    is_online: false,
    package_limit: 5,
    total_earnings: 0,
    total_deliveries: 0,
    last_activity: "",
    last_seen: "",
    created_at: "",
    updated_at: "",
    avg_delivery_time_minutes: 0,
    home_latitude: undefined,
    home_longitude: undefined,
    km_radius: 10,
  });
  
  // Location states for editing
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [tempKmRadius, setTempKmRadius] = useState(10);
  const [mapRef, setMapRef] = useState<any>(null);
  const [updatingLocation, setUpdatingLocation] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(0.25);

  // KM radius değiştiğinde haritayı güncelle
  useEffect(() => {
    if (mapRef && selectedLocation && tempKmRadius > 0) {
      // Daire boyutuna göre dinamik zoom hesaplama
      // Dairenin tam görünmesi için radius * 4 formülü kullanıyoruz
      const dynamicZoom = Math.max(tempKmRadius * 0.01 * 4, 0.02); // Minimum 0.02
      const newZoom = Math.min(dynamicZoom, 3.0); // Maximum 3.0 (çok büyük alan)
      
      setCurrentZoom(newZoom);
      
      setTimeout(() => {
        mapRef.animateToRegion({
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
          latitudeDelta: newZoom,
          longitudeDelta: newZoom,
        }, 800);
      }, 100);
    }
  }, [tempKmRadius, selectedLocation, mapRef]);

  // Modal açıldığında mevcut konum verilerini yükle
  useEffect(() => {
    if (locationModalVisible && userData.home_latitude && userData.home_longitude) {
      console.log('📍 Modal açıldı, konum verilerini set ediliyor:', {
        home_latitude: userData.home_latitude,
        home_longitude: userData.home_longitude,
        km_radius: userData.km_radius
      });
      
      setSelectedLocation({
        latitude: userData.home_latitude,
        longitude: userData.home_longitude,
      });
      setTempKmRadius(userData.km_radius || 10);
    }
  }, [locationModalVisible, userData.home_latitude, userData.home_longitude, userData.km_radius]);

  // Konum güncelleme fonksiyonu
  const updateLocationSettings = async () => {
    if (!selectedLocation) {
      Alert.alert("Hata", "Lütfen bir konum seçin");
      return;
    }

    setUpdatingLocation(true);
    try {
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.UPDATE_COURIER_PROFILE(userData.id)), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          home_latitude: selectedLocation.latitude,
          home_longitude: selectedLocation.longitude,
          km_radius: tempKmRadius,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setUserData(prev => ({
          ...prev,
          home_latitude: selectedLocation.latitude,
          home_longitude: selectedLocation.longitude,
          km_radius: tempKmRadius,
        }));
        setLocationModalVisible(false);
        Alert.alert("Başarılı", "Konum ayarlarınız güncellendi");
      } else {
        Alert.alert("Hata", data.message || "Konum güncellenirken bir hata oluştu");
      }
    } catch (error) {
      console.error('Location update error:', error);
      Alert.alert("Hata", "Bağlantı hatası oluştu");
    } finally {
      setUpdatingLocation(false);
    }
  };

  // Harita basıldığında
  const handleMapPress = (event: any) => {
    const { coordinate } = event.nativeEvent;
    setSelectedLocation({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
    });
  };

  // GPS konumu al
  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('İzin Gerekli', 'Konum izni gerekli');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const newLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setSelectedLocation(newLocation);
      
      if (mapRef) {
        mapRef.animateToRegion({
          ...newLocation,
          latitudeDelta: currentZoom,
          longitudeDelta: currentZoom,
        }, 1000);
      }
    } catch (error) {
      console.error('GPS error:', error);
      Alert.alert('Hata', 'GPS konumu alınamadı');
    }
  };

  // Zoom In fonksiyonu
  const handleZoomIn = () => {
    if (mapRef && selectedLocation) {
      const newZoom = Math.max(currentZoom * 0.5, 0.005); // Minimum zoom limit
      setCurrentZoom(newZoom);
      mapRef.animateToRegion({
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        latitudeDelta: newZoom,
        longitudeDelta: newZoom,
      }, 500);
    }
  };

  // Zoom Out fonksiyonu
  const handleZoomOut = () => {
    if (mapRef && selectedLocation) {
      const newZoom = Math.min(currentZoom * 2, 3.0); // Maximum zoom limit daha da artırıldı
      setCurrentZoom(newZoom);
      mapRef.animateToRegion({
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        latitudeDelta: newZoom,
        longitudeDelta: newZoom,
      }, 500);
    }
  };

  // Restoranları yükle
  const loadRestaurants = async () => {
    try {
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.GET_ALL_RESTAURANTS));
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          const restaurantsWithLocation = data.data.filter((restaurant: any) => 
            restaurant.latitude && restaurant.longitude
          );
          setRestaurants(restaurantsWithLocation);
          console.log('📍 Restoran sayısı:', restaurantsWithLocation.length);
        }
      } else {
        console.error('Restoranlar yüklenemedi');
      }
    } catch (error) {
      console.error('Restoran yükleme hatası:', error);
    }
  };

  // Modal açıldığında restoranları yükle
  useEffect(() => {
    if (locationModalVisible) {
      loadRestaurants();
    }
  }, [locationModalVisible]);

  // Restoran isimlerinin çakışmaması için offset hesaplama
  const getLabelOffset = (index: number): { x: number; y: number } => {
    const positions = [
      { x: 0, y: -40 },      // Üst
      { x: 35, y: -30 },     // Sağ üst
      { x: -35, y: -30 },    // Sol üst
      { x: 40, y: 0 },       // Sağ
      { x: -40, y: 0 },      // Sol
      { x: 30, y: 25 },      // Sağ alt
      { x: -30, y: 25 },     // Sol alt
      { x: 0, y: 30 },       // Alt
    ];
    return positions[index % positions.length];
  };

  // Kullanıcı bilgilerini yükle
  useEffect(() => {
    loadUserData();
    loadContentPages();
  }, []);

  const loadUserData = async () => {
    try {
      const userId = await AsyncStorage.getItem('userId');
      
      if (userId) {
        try {
          const response = await authedFetch(getFullUrl(API_ENDPOINTS.GET_COURIER(userId)));
          if (response.ok) {
            const data = await response.json();
            const courierData = data.data;
            
            console.log('📍 Courier data from API:', {
              home_latitude: courierData.home_latitude,
              home_longitude: courierData.home_longitude,
              km_radius: courierData.km_radius
            });

            const userInfo: UserData = {
              id: courierData.id.toString(),
              name: courierData.name || "",
              email: courierData.email || "",
              phone: courierData.phone || "",
              is_blocked: courierData.is_blocked || false,
              is_online: courierData.is_online || false,
              package_limit: courierData.package_limit || 5,
              total_earnings: courierData.total_earnings || 0,
              total_deliveries: courierData.total_deliveries || 0,
              last_activity: courierData.last_activity || "",
              last_seen: courierData.last_seen || "",
              created_at: courierData.created_at || "",
              updated_at: courierData.updated_at || "",
              avg_delivery_time_minutes: courierData.avg_delivery_time_minutes || 0,
              home_latitude: courierData.home_latitude ? parseFloat(courierData.home_latitude) : undefined,
              home_longitude: courierData.home_longitude ? parseFloat(courierData.home_longitude) : undefined,
              km_radius: courierData.km_radius || 10,
            };
            setUserData(userInfo);
            setEditUserData(userInfo);
          } else {
            console.error('Failed to fetch courier data');
          }
        } catch (error) {
          console.error('API error:', error);
        }
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Content pages yükleme fonksiyonu
  const loadContentPages = async () => {
    try {
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.GET_CONTENT_PAGES));
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setContentPages(data.data);
        }
      }
    } catch (error) {
      console.error('Content pages yükleme hatası:', error);
    }
  };

  // Şifre değiştirme fonksiyonu
  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      Alert.alert("Hata", "Yeni şifreler uyuşmuyor");
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert("Hata", "Yeni şifre en az 6 karakter olmalıdır");
      return;
    }

    try {
      const response = await fetch("http://localhost:3000/api/change-password", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userData.id,
          currentPassword,
          newPassword,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        Alert.alert("Başarılı", "Şifre başarıyla değiştirildi");
        setPasswordModalVisible(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        Alert.alert("Hata", data.message || "Şifre değiştirilemedi");
      }
    } catch (error) {
      console.error("Password change error:", error);
      Alert.alert("Hata", "Sunucu bağlantı hatası");
    }
  };

  // Profil güncelleme fonksiyonu
  const handleUpdateProfile = async () => {
    try {
      const userId = await AsyncStorage.getItem('userId');
      if (!userId) return;
      
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.UPDATE_COURIER_PROFILE(userId)), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editUserData.name,
          email: editUserData.email,
          phone: editUserData.phone,
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        const updatedData = data.data;
        const userInfo: UserData = {
          ...userData,
          name: updatedData.name,
          email: updatedData.email,
          phone: updatedData.phone,
          updated_at: updatedData.updated_at,
        };
        setUserData(userInfo);
        setEditUserData(userInfo);
        setProfileModalVisible(false);
        Alert.alert("Başarılı", "Profil başarıyla güncellendi");
      } else {
        Alert.alert("Hata", "Profil güncellenirken bir hata oluştu");
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      Alert.alert("Hata", "Profil güncellenirken bir hata oluştu");
    }
  };

  // Tercihler fonksiyonları
  const fetchPreferences = async () => {
    try {
      setPreferencesLoading(true);
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.GET_COURIER_PREFERENCES(userData.id)));
      const data = await response.json();
      
      if (data.success) {
        setNotificationMode(data.data.notification_mode);
        setRestaurants(data.data.restaurants);
        
        // Seçili restoranları ayarla
        const selected = data.data.restaurants
          .filter((r: any) => r.is_selected)
          .map((r: any) => r.id);
        setSelectedRestaurants(selected);
      }
    } catch (error) {
      console.error('Tercihler yüklenirken hata:', error);
      Alert.alert('Hata', 'Tercihler yüklenirken bir hata oluştu.');
    } finally {
      setPreferencesLoading(false);
    }
  };

  const toggleRestaurantSelection = (restaurantId: number) => {
    if (selectedRestaurants.includes(restaurantId)) {
      setSelectedRestaurants(prev => prev.filter(id => id !== restaurantId));
    } else {
      setSelectedRestaurants(prev => [...prev, restaurantId]);
    }
  };

  const savePreferences = async () => {
    try {
      setPreferencesLoading(true);
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.UPDATE_COURIER_PREFERENCES(userData.id)), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notification_mode: notificationMode,
          selected_restaurants: notificationMode === 'selected_restaurants' ? selectedRestaurants : []
        }),
      });

      const data = await response.json();
      if (data.success) {
        Alert.alert('Başarılı', 'Tercihleriniz başarıyla kaydedildi.');
        setPreferencesModalVisible(false);
      } else {
        Alert.alert('Hata', data.message || 'Tercihler kaydedilirken bir hata oluştu.');
      }
    } catch (error) {
      console.error('Tercihler kaydedilirken hata:', error);
      Alert.alert('Hata', 'Tercihler kaydedilirken bir hata oluştu.');
    } finally {
      setPreferencesLoading(false);
    }
  };

  const openPreferences = () => {
    setPreferencesModalVisible(true);
    fetchPreferences();
  };

  // Sorun bildir fonksiyonu
  const handleReportIssue = () => {
    setReportIssueModalVisible(true);
  };

  // Sorun bildir gönder
  const handleSubmitReportIssue = async () => {
    if (!reportTitle || !reportDescription) {
      Alert.alert("Hata", "Lütfen başlık ve açıklama girin");
      return;
    }

    try {
      const response = await authedFetch(getFullUrl('/api/support-ticket'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: reportTitle,
          description: reportDescription,
          priority: reportPriority,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        Alert.alert("Başarılı", "Sorun bildiriminiz başarıyla gönderildi");
        setReportIssueModalVisible(false);
        setReportTitle("");
        setReportDescription("");
        setReportPriority('medium');
      } else {
        Alert.alert("Hata", data.message || "Sorun bildirimi gönderilemedi");
      }
    } catch (error) {
      console.error("Report issue error:", error);
      Alert.alert("Hata", "Sunucu bağlantı hatası");
    }
  };

  // Çıkış yapma fonksiyonu
  const handleLogout = () => {
    Alert.alert(
      "Çıkış Yap",
      "Çıkış yapmak istediğinize emin misiniz?",
      [
        { text: "İptal", style: "cancel" },
        {
          text: "Çıkış Yap",
          style: "destructive",
          onPress: () => {
            AsyncStorage.removeItem('userData')
              .then(() => AsyncStorage.removeItem('userId'))
              .then(() => {
                router.replace("/(auth)/sign-in");
              })
              .catch((error) => {
                console.error('Error during logout:', error);
              });
          },
        },
      ],
      { cancelable: false }
    );
  };

  // Hesabı sil
  const handleDeleteAccount = async () => {
    try {
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.DELETE_ACCOUNT), {
        method: 'DELETE'
      });
      const data = await response.json();
      if (response.ok && data.success) {
        await AsyncStorage.multiRemove(['userData', 'userId', 'userToken', 'pushToken', 'pushTokenUserId', 'pushTokenUserType', 'expoPushToken']);
        Alert.alert('Hesap Silindi', 'Hesabınız başarıyla silindi.');
        router.replace('/(auth)/sign-in');
      } else {
        Alert.alert('Hata', data.message || 'Hesap silinemedi.');
      }
    } catch (error) {
      console.error('Hesap silme hatası:', error);
      Alert.alert('Hata', 'Hesap silinirken bir hata oluştu.');
    } finally {
      setDeleteConfirmVisible(false);
      setDeleteConfirmText("");
    }
  };

  // Kurye emoji'si
  const getCourierEmoji = () => '🚴';

  // Kurye renk şeması
  const getCourierColor = (): readonly [string, string] => ['#8B5CF6', '#8B5CF6'];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  if (!userData.id) {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorContent}>
          <Ionicons name="warning-outline" size={48} color="#EF4444" />
          <Text style={styles.errorTitle}>Kullanıcı Bulunamadı</Text>
          <Text style={styles.errorSubtitle}>Kullanıcı bilgileri yüklenemedi</Text>
          <TouchableOpacity
            style={styles.errorButton}
            onPress={() => router.replace("/(auth)/sign-in")}
          >
            <Text style={styles.errorButtonText}>Giriş Sayfasına Dön</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <>
      <StatusBar backgroundColor={getCourierColor()[0]} barStyle="light-content" />
      
      {/* Şifre Değiştirme Modalı */}
      <Modal
        visible={passwordModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setPasswordModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Şifre Değiştir</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setPasswordModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Mevcut Şifre</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Mevcut şifrenizi girin"
                  secureTextEntry
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Yeni Şifre</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Yeni şifrenizi girin"
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Yeni Şifre Tekrar</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Yeni şifrenizi tekrar girin"
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleChangePassword}
              >
                <Text style={styles.primaryButtonText}>Şifreyi Değiştir</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setPasswordModalVisible(false)}
              >
                <Text style={styles.secondaryButtonText}>İptal</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Sorun Bildir Modalı */}
      <Modal
        visible={reportIssueModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setReportIssueModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sorun Bildir</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setReportIssueModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Başlık</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Sorun başlığını girin"
                  value={reportTitle}
                  onChangeText={setReportTitle}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Açıklama</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Sorun açıklamasını detaylı olarak girin"
                  value={reportDescription}
                  onChangeText={setReportDescription}
                  multiline
                  numberOfLines={4}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Öncelik</Text>
                <View style={styles.priorityContainer}>
                  {[
                    { value: 'low', label: 'Düşük', color: '#10B981' },
                    { value: 'medium', label: 'Orta', color: '#F59E0B' },
                    { value: 'high', label: 'Yüksek', color: '#EF4444' }
                  ].map((priority) => (
                    <TouchableOpacity
                      key={priority.value}
                      style={[
                        styles.priorityOption,
                        reportPriority === priority.value && styles.priorityOptionSelected
                      ]}
                      onPress={() => setReportPriority(priority.value as 'low' | 'medium' | 'high')}
                    >
                      <Text style={[
                        styles.priorityText,
                        reportPriority === priority.value && styles.priorityTextSelected
                      ]}>
                        {priority.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleSubmitReportIssue}
              >
                <Text style={styles.primaryButtonText}>Sorun Bildir</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setReportIssueModalVisible(false)}
              >
                <Text style={styles.secondaryButtonText}>İptal</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Hesap Silme Onayı */}
      <Modal
        visible={deleteConfirmVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDeleteConfirmVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Hesabı Sil</Text>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setDeleteConfirmVisible(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={{ color: '#111827', marginBottom: 16 }}>
                Bu işlem geri alınamaz. Hesabınızı ve tüm verilerinizi silmek istediğinize emin misiniz?
              </Text>
              <Text style={{ color: '#374151', marginBottom: 8, fontWeight: '600' }}>
                Onaylamak için kutuya EVET yazın
              </Text>
              <TextInput
                style={styles.input}
                placeholder="EVET"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
                value={deleteConfirmText}
                onChangeText={setDeleteConfirmText}
              />
              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: '#DC2626' }]} onPress={async () => { await handleDeleteAccount(); setDeleteConfirmText(""); }} disabled={deleteConfirmText.trim().toUpperCase() !== 'EVET'}>
                <Text style={styles.primaryButtonText}>Evet, Hesabımı Sil</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setDeleteConfirmVisible(false)}>
                <Text style={styles.secondaryButtonText}>Vazgeç</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Profil Düzenleme Modalı */}
      <Modal
        visible={profileModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Profili Düzenle</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setProfileModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Ad Soyad</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ad Soyad"
                  value={editUserData.name}
                  onChangeText={(text) => setEditUserData({ ...editUserData, name: text })}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>E-posta</Text>
                <TextInput
                  style={styles.input}
                  placeholder="E-posta"
                  value={editUserData.email}
                  onChangeText={(text) => setEditUserData({ ...editUserData, email: text })}
                  keyboardType="email-address"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Telefon</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Telefon"
                  value={editUserData.phone}
                  onChangeText={(text) => setEditUserData({ ...editUserData, phone: text })}
                  keyboardType="phone-pad"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleUpdateProfile}
              >
                <Text style={styles.primaryButtonText}>Güncelle</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setProfileModalVisible(false)}
              >
                <Text style={styles.secondaryButtonText}>İptal</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Bildirim Tercihleri Modalı */}
      <Modal
        visible={preferencesModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setPreferencesModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Bildirim Tercihleri</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setPreferencesModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {preferencesLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#8B5CF6" />
                  <Text style={styles.loadingText}>Yükleniyor...</Text>
                </View>
              ) : (
                <>
                  {/* Bildirim Modu Seçimi */}
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Bildirim Modu</Text>
                    
                    <TouchableOpacity
                      style={[styles.radioOption, notificationMode === 'all_restaurants' && styles.radioOptionSelected]}
                      onPress={() => setNotificationMode('all_restaurants')}
                    >
                      <View style={[styles.radioCircle, notificationMode === 'all_restaurants' && styles.radioCircleSelected]}>
                        {notificationMode === 'all_restaurants' && <View style={styles.radioInner} />}
                      </View>
                      <View style={styles.radioContent}>
                        <Text style={styles.radioTitle}>Tüm Restoranlar</Text>
                        <Text style={styles.radioSubtitle}>Tüm restoranlardan sipariş bildirimi al</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.radioOption, notificationMode === 'selected_restaurants' && styles.radioOptionSelected]}
                      onPress={() => setNotificationMode('selected_restaurants')}
                    >
                      <View style={[styles.radioCircle, notificationMode === 'selected_restaurants' && styles.radioCircleSelected]}>
                        {notificationMode === 'selected_restaurants' && <View style={styles.radioInner} />}
                      </View>
                      <View style={styles.radioContent}>
                        <Text style={styles.radioTitle}>Seçili Restoranlar</Text>
                        <Text style={styles.radioSubtitle}>Sadece seçtiğiniz restoranlardan bildirim al</Text>
                      </View>
                    </TouchableOpacity>
                  </View>

                  {/* Restoran Seçimi */}
                  {notificationMode === 'selected_restaurants' && (
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>
                        Restoranları Seç ({selectedRestaurants.length}/{restaurants.length})
                      </Text>
                      
                      {restaurants.map((restaurant) => (
                        <TouchableOpacity
                          key={restaurant.id}
                          style={[styles.checkboxOption, selectedRestaurants.includes(restaurant.id) && styles.checkboxOptionSelected]}
                          onPress={() => toggleRestaurantSelection(restaurant.id)}
                        >
                          <Text style={[styles.checkboxTitle, selectedRestaurants.includes(restaurant.id) && styles.checkboxTitleSelected]}>
                            {restaurant.name}
                          </Text>
                          <View style={[styles.checkbox, selectedRestaurants.includes(restaurant.id) && styles.checkboxSelected]}>
                            {selectedRestaurants.includes(restaurant.id) && (
                              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                            )}
                          </View>
                        </TouchableOpacity>
                      ))}
                      
                      {restaurants.length === 0 && (
                        <Text style={styles.emptyText}>Henüz restoran bulunmuyor.</Text>
                      )}
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={savePreferences}
                    disabled={preferencesLoading}
                  >
                    <Text style={styles.primaryButtonText}>
                      {preferencesLoading ? 'Kaydediliyor...' : 'Kaydet'}
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => setPreferencesModalVisible(false)}
                  >
                    <Text style={styles.secondaryButtonText}>İptal</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <LinearGradient
        colors={["#8B5CF6", "#6366F1", "#4F46E5"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.fullScreenGradient}
      >
        <SafeAreaView style={styles.container}>
          {/* Header - Küçültülmüş */}
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Kurye Profili</Text>
            <Text style={styles.headerSubtitle}>Hesap bilgilerinizi yönetin</Text>
          </View>

          {/* Content Container */}
          <View style={styles.contentBackground}>
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
              <View style={styles.contentContainer}>
            
            {/* Profile Card */}
            <View style={styles.profileCard}>
              {/* Avatar Section */}
              <View style={styles.avatarSection}>
                <View style={styles.avatarContainer}>
                  <View
                    style={[styles.avatar, { backgroundColor: getCourierColor()[0] + '20' }]}
                  >
                    <Text style={styles.avatarEmoji}>{getCourierEmoji()}</Text>
                  </View>
                  <View style={styles.avatarBadge}>
                    <Ionicons name="checkmark-circle" size={18} color={getCourierColor()[0]} />
                  </View>
                </View>

                {/* User Info */}
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{userData.name}</Text>
                  <Text style={styles.userEmail}>{userData.email}</Text>
                  <View style={[styles.roleBadge, { backgroundColor: getCourierColor()[0] + '20' }]}>
                    <Text style={[styles.roleBadgeText, { color: getCourierColor()[0] }]}>
                      🚴 Kurye
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Account Details */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Hesap Bilgileri</Text>
              
              <View style={styles.infoItem}>
                <View style={styles.infoItemLeft}>
                  <View style={[styles.infoIcon, { backgroundColor: '#EEF2FF' }]}>
                    <Ionicons name="person-outline" size={20} color="#6366F1" />
                  </View>
                  <View>
                    <Text style={styles.infoLabel}>Kullanıcı ID</Text>
                    <Text style={styles.infoValue}>#{userData.id}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.infoItem}>
                <View style={styles.infoItemLeft}>
                  <View style={[styles.infoIcon, { backgroundColor: '#ECFDF5' }]}>
                    <Ionicons name="mail-outline" size={20} color="#10B981" />
                  </View>
                  <View>
                    <Text style={styles.infoLabel}>E-posta</Text>
                    <Text style={styles.infoValue}>{userData.email}</Text>
                  </View>
                </View>
              </View>

              <View style={[styles.infoItem, { borderBottomWidth: 0 }]}>
                <View style={styles.infoItemLeft}>
                  <View style={[styles.infoIcon, { backgroundColor: '#FFF7ED' }]}>
                    <Ionicons name="call-outline" size={20} color="#F59E0B" />
                  </View>
                  <View>
                    <Text style={styles.infoLabel}>Telefon</Text>
                    <Text style={styles.infoValue}>{userData.phone || 'Belirtilmemiş'}</Text>
                  </View>
                </View>
              </View>


            </View>

            {/* Courier Stats */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>İstatistikler</Text>
              
              <View style={styles.infoItem}>
                <View style={styles.infoItemLeft}>
                  <View style={[styles.infoIcon, { backgroundColor: '#EEF2FF' }]}>
                                         <Ionicons name="cube-outline" size={20} color="#6366F1" />
                  </View>
                  <View>
                    <Text style={styles.infoLabel}>Sipariş Limiti</Text>
                    <Text style={styles.infoValue}>{userData.package_limit} sipariş</Text>
                  </View>
                </View>
              </View>

              <View style={styles.infoItem}>
                <View style={styles.infoItemLeft}>
                  <View style={[styles.infoIcon, { backgroundColor: '#ECFDF5' }]}>
                    <Ionicons name="checkmark-done-outline" size={20} color="#10B981" />
                  </View>
                  <View>
                    <Text style={styles.infoLabel}>Teslim Edilen Siparişler</Text>
                    <Text style={styles.infoValue}>{userData.total_deliveries || 0} sipariş</Text>
                  </View>
                </View>
              </View>

              <View style={styles.infoItem}>
                <View style={styles.infoItemLeft}>
                  <View style={[styles.infoIcon, { backgroundColor: '#FEF3C7' }]}>
                    <Ionicons name="time-outline" size={20} color="#F59E0B" />
                  </View>
                  <View>
                    <Text style={styles.infoLabel}>Ortalama Teslimat Süresi</Text>
                    <Text style={styles.infoValue}>
                      {userData.avg_delivery_time_minutes && userData.avg_delivery_time_minutes > 0 
                        ? `${Math.round(userData.avg_delivery_time_minutes)} dakika`
                        : 'Veri yok'
                      }
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[styles.infoItem, { borderBottomWidth: 0 }]}>
                <View style={styles.infoItemLeft}>
                  <View style={[styles.infoIcon, { backgroundColor: '#F3F4F6' }]}>
                    <Ionicons name="calendar-outline" size={20} color="#6B7280" />
                  </View>
                  <View>
                    <Text style={styles.infoLabel}>Kayıt Tarihi</Text>
                    <Text style={styles.infoValue}>
                      {userData.created_at ? new Date(userData.created_at).toLocaleDateString('tr-TR') : 'Belirtilmemiş'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>



            {/* Location Settings Section */}
            <View style={[styles.card, styles.disabledCard]}>
              <Text style={[styles.cardTitle, styles.disabledText]}>Konum Ayarları</Text>
              
              <View style={styles.infoItem}>
                <View style={styles.infoItemLeft}>
                  <View style={[styles.infoIcon, { backgroundColor: '#F3F4F6' }]}>
                    <Ionicons name="location-outline" size={20} color="#9CA3AF" />
                  </View>
                  <View>
                    <Text style={[styles.infoLabel, styles.disabledText]}>Çalışma Konumu</Text>
                    <Text style={[styles.infoValue, styles.disabledText]}>
                      {userData.home_latitude && userData.home_longitude 
                        ? `${userData.home_latitude.toFixed(4)}, ${userData.home_longitude.toFixed(4)}`
                        : 'Henüz ayarlanmamış'
                      }
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.infoItem}>
                <View style={styles.infoItemLeft}>
                  <View style={[styles.infoIcon, { backgroundColor: '#F3F4F6' }]}>
                    <Ionicons name="radio-outline" size={20} color="#9CA3AF" />
                  </View>
                  <View>
                    <Text style={[styles.infoLabel, styles.disabledText]}>Bildirim Mesafesi</Text>
                    <Text style={[styles.infoValue, styles.disabledText]}>{userData.km_radius || 10} km </Text>
                  </View>
                </View>
              </View>

              <View
                style={[styles.infoItem, { borderBottomWidth: 0 }]}
              >
                <View style={styles.infoItemLeft}>
                  <View style={[styles.infoIcon, { backgroundColor: '#F3F4F6' }]}>
                    <Ionicons name="settings-outline" size={20} color="#9CA3AF" />
                  </View>
                  <View>
                    <Text style={[styles.infoValue, styles.disabledText]}>Konum Ayarlarını Düzenle</Text>
                    <Text style={[styles.infoLabel, styles.disabledText]}>Bu özellik şu anda devre dışıdır</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
              </View>
            </View>

            {/* Actions Section */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Hesap İşlemleri</Text>
              
              <TouchableOpacity
                style={styles.infoItem}
                onPress={() => setProfileModalVisible(true)}
                activeOpacity={0.7}
              >
                <View style={styles.infoItemLeft}>
                  <View style={[styles.infoIcon, { backgroundColor: '#EEF2FF' }]}>
                    <Ionicons name="create-outline" size={20} color="#6366F1" />
                  </View>
                  <View>
                    <Text style={styles.infoValue}>Profili Düzenle</Text>
                    <Text style={styles.infoLabel}>Bilgilerinizi güncelleyin</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.infoItem}
                onPress={openPreferences}
                activeOpacity={0.7}
              >
                <View style={styles.infoItemLeft}>
                  <View style={[styles.infoIcon, { backgroundColor: '#EEF2FF' }]}>
                    <Ionicons name="settings-outline" size={20} color="#6366F1" />
                  </View>
                  <View>
                    <Text style={styles.infoValue}>Bildirim Tercihleri</Text>
                    <Text style={styles.infoLabel}>Hangi restoranlardan bildirim alacağınızı seçin</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.infoItem, { borderBottomWidth: 0 }]}
                onPress={() => setPasswordModalVisible(true)}
                activeOpacity={0.7}
              >
                <View style={styles.infoItemLeft}>
                  <View style={[styles.infoIcon, { backgroundColor: '#FFF7ED' }]}>
                    <Ionicons name="lock-closed-outline" size={20} color="#F59E0B" />
                  </View>
                  <View>
                    <Text style={styles.infoValue}>Şifre Değiştir</Text>
                    <Text style={styles.infoLabel}>Hesap güvenliğinizi koruyun</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>

            </View>

            {/* Logout Button */}
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#FEF2F2', '#FEE2E2']}
                style={styles.logoutButtonInner}
              >
                <View style={styles.logoutButtonContent}>
                  <View style={styles.logoutIconContainer}>
                    <Ionicons name="log-out-outline" size={24} color="#DC2626" />
                  </View>
                  <Text style={styles.logoutButtonText}>Çıkış Yap</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            {/* Footer Links */}
            <View style={styles.footerLinks}>
              <Text style={styles.footerTitle}>KuryeX</Text>
              <View style={styles.footerLinksContainer}>
                <TouchableOpacity 
                  onPress={() => Alert.alert(
                    contentPages.privacy?.title || 'Gizlilik Politikası', 
                    contentPages.privacy?.content || 'Gizlilik politikası yakında güncellenecektir.'
                  )}
                >
                  <Text style={styles.footerLinkText}>Gizlilik Politikası</Text>
                </TouchableOpacity>
                
                <Text style={styles.footerSeparator}>•</Text>
                
                <TouchableOpacity 
                  onPress={() => Alert.alert(
                    contentPages.terms?.title || 'Kullanım Koşulları', 
                    contentPages.terms?.content || 'Kullanım koşulları yakında güncellenecektir.'
                  )}
                >
                  <Text style={styles.footerLinkText}>Kullanım Koşulları</Text>
                </TouchableOpacity>
                
                <Text style={styles.footerSeparator}>•</Text>
                
                <TouchableOpacity 
                  onPress={() => Alert.alert(
                    contentPages.support?.title || 'Destek', 
                    contentPages.support?.content || 'Destek bilgileri yakında güncellenecektir.'
                  )}
                >
                  <Text style={styles.footerLinkText}>Destek</Text>
                </TouchableOpacity>
                
                <Text style={styles.footerSeparator}>•</Text>
                
                <TouchableOpacity 
                  onPress={() => handleReportIssue()}
                >
                  <Text style={styles.footerLinkText}>Sorun Bildir</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.footerLinksContainer}>
                <TouchableOpacity 
                  onPress={() => Alert.alert(
                    contentPages.about?.title || 'Hakkında', 
                    contentPages.about?.content || `KuryeX v${Constants.expoConfig?.version || '1.0.0'}\n\nRestoranlar ve kuryeler için geliştirilmiş modern teslimat platformu.`
                  )}
                >
                  <Text style={styles.footerLinkText}>Hakkında</Text>
                </TouchableOpacity>
                
                <Text style={styles.footerSeparator}>•</Text>
                
                <TouchableOpacity 
                  onPress={() => Alert.alert(
                    contentPages.contact?.title || 'İletişim', 
                    contentPages.contact?.content || 'İletişim bilgileri yakında güncellenecektir.'
                  )}
                >
                  <Text style={styles.footerLinkText}>İletişim</Text>
                </TouchableOpacity>
                
                <Text style={styles.footerSeparator}>•</Text>
                
                <TouchableOpacity 
                  onPress={() => Alert.alert(
                    contentPages.faq?.title || 'SSS', 
                    contentPages.faq?.content || 'Sık sorulan sorular yakında güncellenecektir.'
                  )}
                >
                  <Text style={styles.footerLinkText}>SSS</Text>
                </TouchableOpacity>
                
                <Text style={styles.footerSeparator}>•</Text>
                
                <TouchableOpacity 
                  onPress={() => {
                    Alert.alert(
                      'Hesabı Sil',
                      'Hesabınızı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
                      [
                        { text: 'İptal', style: 'cancel' },
                        { 
                          text: 'Sil', 
                          style: 'destructive',
                          onPress: () => setDeleteConfirmVisible(true)
                        }
                      ]
                    );
                  }}
                >
                  <Text style={[styles.footerLinkText, { color: '#EF4444' }]}>Hesabımı Sil</Text>
                </TouchableOpacity>
              </View>
              
              <Text style={styles.footerCopyright}>
                © 2025 KuryeX. Tüm hakları saklıdır.
              </Text>
            </View>

            {/* Footer spacing */}
            <View style={styles.footer} />
              </View>
            </ScrollView>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Konum Düzenleme Modalı */}
      <Modal
        visible={locationModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setLocationModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Konum Ayarları</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setLocationModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Map - En Üste Taşındı */}
              <View style={styles.mapContainer}>
                <MapView
                  ref={setMapRef}
                  style={styles.map}
                  initialRegion={{
                    latitude: selectedLocation ? selectedLocation.latitude : 37.0662,
                    longitude: selectedLocation ? selectedLocation.longitude : 37.3833,
                    latitudeDelta: currentZoom,
                    longitudeDelta: currentZoom,
                  }}
                  onPress={handleMapPress}
                  showsUserLocation={true}
                  showsMyLocationButton={false}
                  onMapReady={() => {
                    // Harita hazır olduğunda mevcut konuma odakla
                    if (selectedLocation && mapRef) {
                      setTimeout(() => {
                        mapRef.animateToRegion({
                          latitude: selectedLocation.latitude,
                          longitude: selectedLocation.longitude,
                          latitudeDelta: currentZoom,
                          longitudeDelta: currentZoom,
                        }, 1000);
                      }, 300);
                    }
                  }}
                >
                  {/* KM Radius Circle */}
                  {selectedLocation && tempKmRadius > 0 && (
                    <Circle
                      center={selectedLocation}
                      radius={tempKmRadius * 1000} // km to meters
                      strokeColor="rgba(16, 185, 129, 0.8)"
                      fillColor="rgba(16, 185, 129, 0.15)"
                      strokeWidth={3}
                    />
                  )}
                  
                  {/* Home Location Marker */}
                  {selectedLocation && (
                    <Marker
                      coordinate={selectedLocation}
                      draggable={true}
                      onDragEnd={(e) => setSelectedLocation(e.nativeEvent.coordinate)}
                    >
                      <View style={styles.customMarker}>
                        <Ionicons name="home" size={24} color="#FFFFFF" />
                      </View>
                    </Marker>
                  )}

                  {/* Restaurant Markers */}
                  {restaurants.map((restaurant, index) => {
                    const offset = getLabelOffset(index);
                    return (
                      <React.Fragment key={restaurant.id}>
                        {/* Restaurant Marker */}
                        <Marker
                          coordinate={{
                            latitude: parseFloat(restaurant.latitude),
                            longitude: parseFloat(restaurant.longitude)
                          }}
                          anchor={{ x: 0.5, y: 0.5 }}
                        >
                          <View style={styles.restaurantMarker}>
                            <Ionicons name="restaurant" size={20} color="#FFFFFF" />
                          </View>
                        </Marker>
                        
                        {/* Restaurant Name Label */}
                        <Marker
                          coordinate={{
                            latitude: parseFloat(restaurant.latitude),
                            longitude: parseFloat(restaurant.longitude)
                          }}
                          anchor={{ x: 0.5, y: 0.5 }}
                          pointerEvents="none"
                        >
                          <View style={[styles.restaurantLabel, { 
                            transform: [
                              { translateX: offset.x }, 
                              { translateY: offset.y }
                            ] 
                          }]}>
                            <Text style={styles.restaurantLabelText} numberOfLines={1}>
                              {restaurant.firma_adi || restaurant.name || 'İsimsiz Restoran'}
                            </Text>
                          </View>
                        </Marker>
                      </React.Fragment>
                    );
                  })}
                </MapView>
                
                {/* Zoom Controls - Sağ Üst */}
                <View style={styles.zoomControls}>
                  <TouchableOpacity
                    style={styles.zoomButton}
                    onPress={handleZoomIn}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={24} color="#FFFFFF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.zoomButton}
                    onPress={handleZoomOut}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="remove" size={24} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                {/* GPS Location Button - Sağ Alt */}
                <View style={styles.locationControls}>
                  <TouchableOpacity
                    style={styles.locationButton}
                    onPress={getCurrentLocation}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="locate" size={24} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* KM Radius Slider - Haritadan Sonra */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Bildirim Mesafesi</Text>
                <View style={styles.sliderContainer}>
                  <Text style={styles.sliderLabel}>0km</Text>
                  <Slider
                    style={styles.slider}
                    minimumValue={0}
                    maximumValue={100}
                    value={tempKmRadius}
                    step={1}
                    onValueChange={setTempKmRadius}
                    minimumTrackTintColor="#10B981"
                    maximumTrackTintColor="#E5E7EB"
                  />
                  <Text style={styles.sliderLabel}>100km</Text>
                </View>
                <Text style={styles.sliderValue}>{tempKmRadius}km</Text>
                
              </View>
              <Text style={styles.mapInstructions}>
                📍 Haritada dokunarak veya kırmızı işareti sürükleyerek ev/çalışma konumunuzu belirleyin{'\n'}
                🟢 Yeşil daire, bildirim alacağınız {tempKmRadius}km mesafeyi gösterir
              </Text>

              <TouchableOpacity
                style={[styles.primaryButton, { marginTop: 20 }]}
                onPress={updateLocationSettings}
                disabled={updatingLocation || !selectedLocation}
              >
                <Text style={styles.primaryButtonText}>
                  {updatingLocation ? 'Güncelleniyor...' : 'Kaydet'}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setLocationModalVisible(false)}
              >
                <Text style={styles.secondaryButtonText}>İptal</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Hesap Silme Onay Modalı */}
      <Modal
        visible={deleteConfirmVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDeleteConfirmVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: '#EF4444' }]}>Hesabı Sil</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setDeleteConfirmVisible(false)}
              >
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.warningText}>
                ⚠️ Bu işlem geri alınamaz. Hesabınızı silmek istediğinizden emin misiniz?
              </Text>
              
              <Text style={styles.deleteConfirmInstruction}>
                Devam etmek için aşağıya "EVET" yazın:
              </Text>
              
              <TextInput
                style={styles.deleteConfirmInput}
                value={deleteConfirmText}
                onChangeText={setDeleteConfirmText}
                placeholder="EVET yazın"
                autoCapitalize="characters"
              />
              
              <TouchableOpacity
                style={[
                  styles.deleteButton,
                  deleteConfirmText !== 'EVET' && styles.deleteButtonDisabled
                ]}
                onPress={handleDeleteAccount}
                disabled={deleteConfirmText !== 'EVET'}
              >
                <Text style={styles.deleteButtonText}>
                  Hesabımı Kalıcı Olarak Sil
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  setDeleteConfirmVisible(false);
                  setDeleteConfirmText("");
                }}
              >
                <Text style={styles.secondaryButtonText}>İptal</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  // Base styles
  fullScreenGradient: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  contentBackground: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    marginTop: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8B5CF6',
    marginTop: 12,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 20,
  },
  errorContent: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 32,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  errorButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  errorButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  // Header styles
  headerContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
  },

  // Content styles
  scrollView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },

  // Profile card styles
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  avatarSection: {
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 32,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userInfo: {
    alignItems: 'center',
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 12,
  },
  roleBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  roleBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Card styles
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },

  // Info item styles
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  infoItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  infoLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    minHeight: '20%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: 20,
    flexGrow: 1,
    maxHeight: '100%',
  },

  // Input styles
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#111827',
  },

  // Button styles
  primaryButton: {
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },

  // Logout button styles
  logoutButton: {
    marginTop: 8,
    marginBottom: 20,
    borderRadius: 16,
    overflow: 'hidden',
  },
  logoutButtonInner: {
    padding: 20,
  },
  logoutButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutIconContainer: {
    backgroundColor: '#FFFFFF',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  logoutButtonText: {
    color: '#DC2626',
    fontSize: 18,
    fontWeight: '700',
  },

  // Radio button styles
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  radioOptionSelected: {
    backgroundColor: '#EEF2FF',
    borderColor: '#8B5CF6',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: '#8B5CF6',
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8B5CF6',
  },
  radioContent: {
    flex: 1,
  },
  radioTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  radioSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },

  // Checkbox styles
  checkboxOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  checkboxOptionSelected: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  checkboxTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  checkboxTitleSelected: {
    color: '#059669',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 20,
    fontStyle: 'italic',
  },

  // Footer Links
  footerLinks: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 16,
  },
  footerTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#059669',
    textAlign: 'center',
    marginBottom: 12,
  },
  footerLinksContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  footerLinkText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#6B7280',
    textAlign: 'center',
  },
  footerSeparator: {
    fontSize: 12,
    color: '#9CA3AF',
    marginHorizontal: 8,
  },
  footerCopyright: {
    fontSize: 10,
    color: '#9CA3AF',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
  },

  // Footer
  footer: {
    height: 20,
  },

  // Location Modal Styles
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 15,
  },
  slider: {
    flex: 1,
    marginHorizontal: 12,
    height: 40,
  },
  sliderLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  sliderValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
    marginBottom: 5,
  },
 
  gpsButton: {
    backgroundColor: '#10B981',
    padding: 15,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 15,
  },
  gpsButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    marginLeft: 8,
    fontSize: 16,
  },
  mapContainer: {
    height: 400,
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 15,
    backgroundColor: '#F3F4F6',
  },
  map: {
    flex: 1,
  },
  customMarker: {
    backgroundColor: '#EF4444',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },

  zoomControls: {
    position: 'absolute',
    top: 20,
    right: 20,
    flexDirection: 'column',
    gap: 10,
  },
  locationControls: {
    position: 'absolute',
    bottom: 20,
    right: 20,
  },
  zoomButton: {
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    width: 45,
    height: 45,
    borderRadius: 22.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  locationButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  restaurantMarker: {
    backgroundColor: '#10B981',
    borderRadius: 20,
    width: 35,
    height: 35,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  restaurantLabel: {
    backgroundColor: 'rgba(16, 185, 129, 0.95)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
    maxWidth: 120,
  },
  restaurantLabelText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  mapInstructions: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginVertical: 6,
    lineHeight: 16,
  },

  // Support/Report Issue Styles
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  priorityContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  priorityOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
  },
  priorityOptionSelected: {
    borderColor: '#8B5CF6',
    backgroundColor: '#EEF2FF',
  },
  priorityText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  priorityTextSelected: {
    color: '#8B5CF6',
    fontWeight: '600',
  },

  // Delete Account Modal Styles
  warningText: {
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 24,
    fontWeight: '500',
  },
  deleteConfirmInstruction: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 15,
    fontWeight: '500',
  },
  deleteConfirmInput: {
    borderWidth: 2,
    borderColor: '#EF4444',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
    backgroundColor: '#FEF2F2',
  },
  deleteButton: {
    backgroundColor: '#EF4444',
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
  },
  deleteButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Disabled styles
  disabledCard: {
    opacity: 0.6,
    backgroundColor: '#F9FAFB',
  },
  disabledText: {
    color: '#9CA3AF',
  },
});

export default KuryeProfile;

