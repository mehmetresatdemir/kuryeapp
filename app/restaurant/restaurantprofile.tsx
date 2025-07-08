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
  RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from "expo-router";
import { API_ENDPOINTS, getFullUrl, authedFetch } from "../../constants/api";
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';

interface RestaurantData {
  id: number;
  name: string;
  email: string;
  phone: string;
  yetkili_name: string;
  address: string;
  logo: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  role: string;
}

const RestaurantProfile = () => {
  const [user, setUser] = useState<any>(null);
  const [restaurantData, setRestaurantData] = useState<RestaurantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  
  // Modal states
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [preferencesModalVisible, setPreferencesModalVisible] = useState(false);
  
  // Profile form states
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editYetkiliName, setEditYetkiliName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  
  // Password form states
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Preferences states
  const [courierVisibilityMode, setCourierVisibilityMode] = useState<'all_couriers' | 'selected_couriers'>('all_couriers');
  const [couriers, setCouriers] = useState<any[]>([]);
  const [selectedCouriers, setSelectedCouriers] = useState<number[]>([]);
  const [preferencesLoading, setPreferencesLoading] = useState(false);

  // Kullanıcı bilgilerini yükle
  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const userData = await AsyncStorage.getItem('userData');
      if (userData) {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        await fetchRestaurantProfile(parsedUser.id);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Restoran profil bilgilerini API'den getir
  const fetchRestaurantProfile = async (restaurantId: number) => {
    try {
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.GET_RESTAURANT_PROFILE(restaurantId)));
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setRestaurantData(data.data);
          // Form alanlarını güncelle
          setEditName(data.data.name || "");
          setEditPhone(data.data.phone || "");
          setEditYetkiliName(data.data.yetkili_name || "");
          setEditAddress(data.data.address || "");
        }
      } else {
        console.error('Failed to fetch restaurant profile');
      }
    } catch (error) {
      console.error('Error fetching restaurant profile:', error);
    }
  };

  // Refresh fonksiyonu
  const onRefresh = async () => {
    setRefreshing(true);
    if (user?.id) {
      await fetchRestaurantProfile(user.id);
    }
    setRefreshing(false);
  };

  // Profil bilgilerini güncelleme fonksiyonu
  const handleUpdateProfile = async () => {
    if (!user?.id) return;

    try {
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.UPDATE_RESTAURANT_PROFILE(user.id)), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editName,
          phone: editPhone,
          yetkili_name: editYetkiliName,
          address: editAddress,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        Alert.alert("Başarılı", "Profil bilgileri başarıyla güncellendi");
        setProfileModalVisible(false);
        
        // Kullanıcı verisini güncelle
        const updatedUser = { ...user, name: editName };
        setUser(updatedUser);
        await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
        
        // Profil verisini yenile
        await fetchRestaurantProfile(user.id);
      } else {
        Alert.alert("Hata", data.message || "Profil güncellenemedi");
      }
    } catch (error) {
      console.error("Profile update error:", error);
      Alert.alert("Hata", "Sunucu bağlantı hatası");
    }
  };

  // Şifre değiştirme fonksiyonu
  const handleChangePassword = async () => {
    if (!user?.id) return;

    if (newPassword !== confirmPassword) {
      Alert.alert("Hata", "Yeni şifreler uyuşmuyor");
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert("Hata", "Yeni şifre en az 6 karakter olmalıdır");
      return;
    }

    try {
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.CHANGE_RESTAURANT_PASSWORD(user.id)), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
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

  // Logo seçme ve yükleme fonksiyonu
  const handleLogoUpload = async () => {
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
          'İzin Gerekli', 
          'Galeri erişimi için izin gereklidir. Lütfen ayarlardan izin verin.',
          [
            { text: "İptal", style: "cancel" },
            { text: "Tamam", style: "default" }
          ]
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: false,
        exif: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.uri) {
          await uploadLogo(asset.uri);
        }
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Hata', 'Resim seçilirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.');
    }
  };

  // Logo yükleme API çağrısı
  const uploadLogo = async (imageUri: string) => {
    if (!user?.id) return;

    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('logo', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'logo.jpg',
      } as any);

      const response = await fetch(getFullUrl(API_ENDPOINTS.UPLOAD_RESTAURANT_LOGO(user.id)), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await AsyncStorage.getItem('userToken')}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (response.ok && data.success) {
        Alert.alert('Başarılı', 'Logo başarıyla yüklendi');
        await fetchRestaurantProfile(user.id);
      } else {
        Alert.alert('Hata', data.message || 'Logo yüklenemedi');
      }
    } catch (error) {
      console.error('Logo upload error:', error);
      Alert.alert('Hata', 'Logo yüklenirken bir hata oluştu');
    } finally {
      setUploadingLogo(false);
    }
  };

  // Logo silme fonksiyonu
  const handleDeleteLogo = () => {
    Alert.alert(
      'Logo Sil',
      'Logoyu silmek istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;

            try {
              const response = await authedFetch(getFullUrl(API_ENDPOINTS.DELETE_RESTAURANT_LOGO(user.id)), {
                method: 'DELETE',
              });

              const data = await response.json();

              if (response.ok && data.success) {
                Alert.alert('Başarılı', 'Logo başarıyla silindi');
                await fetchRestaurantProfile(user.id);
              } else {
                Alert.alert('Hata', data.message || 'Logo silinemedi');
              }
            } catch (error) {
              console.error('Logo delete error:', error);
              Alert.alert('Hata', 'Logo silinirken bir hata oluştu');
            }
          },
        },
      ]
    );
  };

  // Tercihler fonksiyonları
  const fetchPreferences = async () => {
    if (!restaurantData) return;
    
    try {
      setPreferencesLoading(true);
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.GET_RESTAURANT_PREFERENCES(restaurantData.id)));
      const data = await response.json();
      
      if (data.success) {
        setCourierVisibilityMode(data.data.courier_visibility_mode);
        setCouriers(data.data.couriers);
        
        // Seçili kuryeleri ayarla
        const selected = data.data.couriers
          .filter((c: any) => c.is_selected)
          .map((c: any) => c.id);
        setSelectedCouriers(selected);
      }
    } catch (error) {
      console.error('Tercihler yüklenirken hata:', error);
      Alert.alert('Hata', 'Tercihler yüklenirken bir hata oluştu.');
    } finally {
      setPreferencesLoading(false);
    }
  };

  const toggleCourierSelection = (courierId: number) => {
    if (selectedCouriers.includes(courierId)) {
      setSelectedCouriers(prev => prev.filter(id => id !== courierId));
    } else {
      setSelectedCouriers(prev => [...prev, courierId]);
    }
  };

  const savePreferences = async () => {
    if (!restaurantData) return;
    
    try {
      setPreferencesLoading(true);
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.UPDATE_RESTAURANT_PREFERENCES(restaurantData.id)), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          courier_visibility_mode: courierVisibilityMode,
          selected_couriers: courierVisibilityMode === 'selected_couriers' ? selectedCouriers : []
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
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('userData');
              await AsyncStorage.removeItem('userToken');
              router.replace("/(auth)/sign-in");
            } catch (error) {
              console.error('Error during logout:', error);
            }
          },
        },
      ]
    );
  };

  // Durum badge rengi
  const getStatusBadgeColor = () => {
    return restaurantData?.is_active ? '#10B981' : '#EF4444';
  };

  // Durum metni
  const getStatusText = () => {
    return restaurantData?.is_active ? 'Aktif' : 'Pasif';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  if (!user || !restaurantData) {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorContent}>
          <Ionicons name="warning-outline" size={48} color="#EF4444" />
          <Text style={styles.errorTitle}>Bilgiler Yüklenemedi</Text>
          <Text style={styles.errorSubtitle}>Restoran bilgileri alınamadı</Text>
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
      <StatusBar backgroundColor="#8B5CF6" barStyle="light-content" />
      
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
              <Text style={styles.modalTitle}>Profil Düzenle</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setProfileModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>İşletme Adı</Text>
                <TextInput
                  style={styles.input}
                  placeholder="İşletme adını girin"
                  value={editName}
                  onChangeText={setEditName}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Telefon</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Telefon numarasını girin"
                  value={editPhone}
                  onChangeText={setEditPhone}
                  keyboardType="phone-pad"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Yetkili Adı</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Yetkili kişi adını girin"
                  value={editYetkiliName}
                  onChangeText={setEditYetkiliName}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Adres</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Adres bilgisini girin"
                  value={editAddress}
                  onChangeText={setEditAddress}
                  multiline
                  numberOfLines={3}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleUpdateProfile}
              >
                <Text style={styles.primaryButtonText}>Profili Güncelle</Text>
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

      {/* Kurye Seçimi Modalı */}
      <Modal
        visible={preferencesModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setPreferencesModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Kurye Seçimi</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setPreferencesModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {preferencesLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#059669" />
                  <Text style={styles.loadingText}>Yükleniyor...</Text>
                </View>
              ) : (
                <>
                  {/* Kurye Görünürlük Modu Seçimi */}
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Kurye Görünürlük Modu</Text>
                    
                    <TouchableOpacity
                      style={[styles.radioOption, courierVisibilityMode === 'all_couriers' && styles.radioOptionSelected]}
                      onPress={() => setCourierVisibilityMode('all_couriers')}
                    >
                      <View style={[styles.radioCircle, courierVisibilityMode === 'all_couriers' && styles.radioCircleSelected]}>
                        {courierVisibilityMode === 'all_couriers' && <View style={styles.radioInner} />}
                      </View>
                      <View style={styles.radioContent}>
                        <Text style={styles.radioTitle}>Tüm Kuryeler</Text>
                        <Text style={styles.radioSubtitle}>Siparişlerinizi tüm kuryeler görebilir</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.radioOption, courierVisibilityMode === 'selected_couriers' && styles.radioOptionSelected]}
                      onPress={() => setCourierVisibilityMode('selected_couriers')}
                    >
                      <View style={[styles.radioCircle, courierVisibilityMode === 'selected_couriers' && styles.radioCircleSelected]}>
                        {courierVisibilityMode === 'selected_couriers' && <View style={styles.radioInner} />}
                      </View>
                      <View style={styles.radioContent}>
                        <Text style={styles.radioTitle}>Seçili Kuryeler</Text>
                        <Text style={styles.radioSubtitle}>Sadece seçtiğiniz kuryeler siparişlerinizi görebilir</Text>
                      </View>
                    </TouchableOpacity>
                  </View>

                  {/* Kurye Seçimi */}
                  {courierVisibilityMode === 'selected_couriers' && (
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>
                        Kuryeleri Seç ({selectedCouriers.length}/{couriers.length})
                      </Text>
                      
                      {couriers.map((courier) => (
                        <TouchableOpacity
                          key={courier.id}
                          style={[styles.checkboxOption, selectedCouriers.includes(courier.id) && styles.checkboxOptionSelected]}
                          onPress={() => toggleCourierSelection(courier.id)}
                        >
                          <View style={styles.checkboxContent}>
                            <Text style={[styles.checkboxTitle, selectedCouriers.includes(courier.id) && styles.checkboxTitleSelected]}>
                              {courier.name}
                            </Text>
                            <Text style={styles.checkboxSubtitle}>{courier.phone}</Text>
                          </View>
                          <View style={[styles.checkbox, selectedCouriers.includes(courier.id) && styles.checkboxSelected]}>
                            {selectedCouriers.includes(courier.id) && (
                              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                            )}
                          </View>
                        </TouchableOpacity>
                      ))}
                      
                      {couriers.length === 0 && (
                        <Text style={styles.emptyText}>Henüz kurye bulunmuyor.</Text>
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

      <SafeAreaView style={styles.container}>
        {/* Header */}
        <LinearGradient
          colors={['#059669', '#10B981']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Restoran Profili</Text>
            <Text style={styles.headerSubtitle}>İşletme bilgilerinizi yönetin</Text>
          </View>
        </LinearGradient>

        {/* Content */}
        <ScrollView 
          style={styles.scrollView} 
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <View style={styles.contentContainer}>
            
            {/* Profile Card */}
            <View style={styles.profileCard}>
              {/* Avatar Section */}
              <View style={styles.avatarSection}>
                <View style={styles.avatarContainer}>
                  <TouchableOpacity 
                    style={styles.avatar}
                    onPress={handleLogoUpload}
                    disabled={uploadingLogo}
                  >
                    {restaurantData.logo ? (
                      <Image 
                        source={{ uri: getFullUrl(restaurantData.logo) }} 
                        style={styles.logoImage}
                      />
                    ) : (
                      <View style={styles.logoPlaceholder}>
                        {uploadingLogo ? (
                          <ActivityIndicator size="small" color="#059669" />
                        ) : (
                          <>
                            <Ionicons name="camera-outline" size={24} color="#9CA3AF" />
                            <Text style={styles.logoPlaceholderText}>Logo Ekle</Text>
                          </>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                  
                  {restaurantData.logo && (
                    <TouchableOpacity 
                      style={styles.logoDeleteButton}
                      onPress={handleDeleteLogo}
                    >
                      <Ionicons name="close-circle" size={24} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                  
                  <View style={[styles.statusBadge, { backgroundColor: getStatusBadgeColor() }]}>
                    <Ionicons 
                      name={restaurantData.is_active ? "checkmark-circle" : "close-circle"} 
                      size={16} 
                      color="#FFFFFF" 
                    />
                  </View>
                </View>

                {/* Restaurant Info */}
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{restaurantData.name}</Text>
                  <Text style={styles.userEmail}>{restaurantData.email}</Text>
                  <View style={[styles.roleBadge, { backgroundColor: getStatusBadgeColor() + '20' }]}>
                    <Text style={[styles.roleBadgeText, { color: getStatusBadgeColor() }]}>
                      🏢 {getStatusText()} Restoran
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Business Information */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>İşletme Bilgileri</Text>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => setProfileModalVisible(true)}
                >
                  <Ionicons name="create-outline" size={20} color="#059669" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.infoItem}>
                <View style={styles.infoItemLeft}>
                  <View style={[styles.infoIcon, { backgroundColor: '#EEF2FF' }]}>
                    <Ionicons name="restaurant-outline" size={20} color="#6366F1" />
                  </View>
                  <View>
                    <Text style={styles.infoLabel}>İşletme Adı</Text>
                    <Text style={styles.infoValue}>{restaurantData.name}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.infoItem}>
                <View style={styles.infoItemLeft}>
                  <View style={[styles.infoIcon, { backgroundColor: '#FEF2F2' }]}>
                    <Ionicons name="call-outline" size={20} color="#EF4444" />
                  </View>
                  <View>
                    <Text style={styles.infoLabel}>Telefon</Text>
                    <Text style={styles.infoValue}>{restaurantData.phone || 'Belirtilmemiş'}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.infoItem}>
                <View style={styles.infoItemLeft}>
                  <View style={[styles.infoIcon, { backgroundColor: '#F0F9FF' }]}>
                    <Ionicons name="person-outline" size={20} color="#3B82F6" />
                  </View>
                  <View>
                    <Text style={styles.infoLabel}>Yetkili Kişi</Text>
                    <Text style={styles.infoValue}>{restaurantData.yetkili_name || 'Belirtilmemiş'}</Text>
                  </View>
                </View>
              </View>

              <View style={[styles.infoItem, { borderBottomWidth: 0 }]}>
                <View style={styles.infoItemLeft}>
                  <View style={[styles.infoIcon, { backgroundColor: '#ECFDF5' }]}>
                    <Ionicons name="location-outline" size={20} color="#10B981" />
                  </View>
                  <View style={styles.addressContainer}>
                    <Text style={styles.infoLabel}>Adres</Text>
                    <Text style={styles.infoValue}>
                      {restaurantData.address || 'Belirtilmemiş'}
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
                    <Ionicons name="finger-print-outline" size={20} color="#6366F1" />
                  </View>
                  <View>
                    <Text style={styles.infoLabel}>Kullanıcı ID</Text>
                    <Text style={styles.infoValue}>#{restaurantData.id}</Text>
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
                    <Text style={styles.infoValue}>{restaurantData.email}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.infoItem}>
                <View style={styles.infoItemLeft}>
                  <View style={[styles.infoIcon, { backgroundColor: '#F5F3FF' }]}>
                    <Ionicons name="calendar-outline" size={20} color="#8B5CF6" />
                  </View>
                  <View>
                    <Text style={styles.infoLabel}>Kayıt Tarihi</Text>
                    <Text style={styles.infoValue}>
                      {new Date(restaurantData.created_at).toLocaleDateString('tr-TR')}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[styles.infoItem, { borderBottomWidth: 0 }]}>
                <View style={styles.infoItemLeft}>
                  <View style={[styles.infoIcon, { backgroundColor: getStatusBadgeColor() + '20' }]}>
                    <Ionicons 
                      name={restaurantData.is_active ? "checkmark-circle-outline" : "close-circle-outline"} 
                      size={20} 
                      color={getStatusBadgeColor()} 
                    />
                  </View>
                  <View>
                    <Text style={styles.infoLabel}>Hesap Durumu</Text>
                    <Text style={[styles.infoValue, { color: getStatusBadgeColor() }]}>
                      {getStatusText()}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Preferences Section */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Kurye Tercihleri</Text>
              
              <TouchableOpacity
                style={[styles.infoItem, { borderBottomWidth: 0 }]}
                onPress={openPreferences}
                activeOpacity={0.7}
              >
                <View style={styles.infoItemLeft}>
                  <View style={[styles.infoIcon, { backgroundColor: '#ECFDF5' }]}>
                    <Ionicons name="people-outline" size={20} color="#10B981" />
                  </View>
                  <View>
                    <Text style={styles.infoValue}>Kurye Seçimi</Text>
                    <Text style={styles.infoLabel}>Hangi kuryelerin siparişlerinizi göreceğini ayarlayın</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            {/* Security Section */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Güvenlik Ayarları</Text>
              
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

            {/* Footer spacing */}
            <View style={styles.footer} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
};

const styles = StyleSheet.create({
  // Base styles
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
    color: '#059669',
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
    backgroundColor: '#059669',
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
  header: {
    paddingTop: 20,
    paddingBottom: 40,
    backgroundColor: '#8B5CF6',
  },
  headerContent: {
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
  },

  // Content styles
  scrollView: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  contentContainer: {
    paddingHorizontal: 20,
    marginTop: -20,
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
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 32,
  },
  logoImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  logoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoPlaceholderText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
    textAlign: 'center',
  },
  logoDeleteButton: {
    position: 'absolute',
    top: -8,
    left: -8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    borderRadius: 12,
    padding: 4,
    borderWidth: 2,
    borderColor: '#FFFFFF',
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  editButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
  },

  // Info item styles
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  infoItemLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  addressContainer: {
    flex: 1,
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
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },

  // Button styles
  primaryButton: {
    backgroundColor: '#059669',
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
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
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
    borderColor: '#059669',
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#059669',
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
  checkboxContent: {
    flex: 1,
  },
  checkboxTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  checkboxTitleSelected: {
    color: '#059669',
  },
  checkboxSubtitle: {
    fontSize: 14,
    color: '#6B7280',
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

  // Footer
  footer: {
    height: 20,
  },
});

export default RestaurantProfile;