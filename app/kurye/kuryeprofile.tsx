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
  });



  // Kullanıcı bilgilerini yükle
  useEffect(() => {
    loadUserData();
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
            
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
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
            
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
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
                  onPress={() => Alert.alert('Gizlilik Politikası', 'Kişisel verilerinizin güvenliği bizim için çok önemlidir. Gizlilik politikamız yakında güncellenecektir.')}
                >
                  <Text style={styles.footerLinkText}>Gizlilik Politikası</Text>
                </TouchableOpacity>
                
                <Text style={styles.footerSeparator}>•</Text>
                
                <TouchableOpacity 
                  onPress={() => Alert.alert('Kullanım Koşulları', 'Uygulamamızı kullanarak hizmet koşullarımızı kabul etmiş olursunuz. Detaylı bilgi için yakında güncelleme yapılacaktır.')}
                >
                  <Text style={styles.footerLinkText}>Kullanım Koşulları</Text>
                </TouchableOpacity>
                
                <Text style={styles.footerSeparator}>•</Text>
                
                <TouchableOpacity 
                  onPress={() => Alert.alert('Destek', 'Herhangi bir sorunuz için bizimle iletişime geçebilirsiniz.\n\nE-posta: cresat26@gmail.com\nTelefon: 0531 881 39 05')}
                >
                  <Text style={styles.footerLinkText}>Destek</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.footerLinksContainer}>
                <TouchableOpacity 
                  onPress={() => Alert.alert('Hakkında', `KuryeX v${Constants.expoConfig?.version || '1.0.0'}\n\nRestoranlar ve kuryeler için geliştirilmiş modern teslimat platformu. Güvenli, hızlı ve kolay kullanım.`)}
                >
                  <Text style={styles.footerLinkText}>Hakkında</Text>
                </TouchableOpacity>
                
                <Text style={styles.footerSeparator}>•</Text>
                
                <TouchableOpacity 
                  onPress={() => Alert.alert('İletişim', 'Bizimle iletişime geçin:\n\nE-posta: cresat26@gmail.com\nTelefon: 0531 881 39 05\nAdres: Gaziantep, Türkiye')}
                >
                  <Text style={styles.footerLinkText}>İletişim</Text>
                </TouchableOpacity>
                
                <Text style={styles.footerSeparator}>•</Text>
                
                <TouchableOpacity 
                  onPress={() => Alert.alert('SSS', 'Sık Sorulan Sorular:\n\n• Hesabımı nasıl güncellerim?\n• Şifremi nasıl değiştiririm?\n• Hangi siparişleri alabilirim?\n\nDaha fazla bilgi için destek ile iletişime geçin.')}
                >
                  <Text style={styles.footerLinkText}>SSS</Text>
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
    maxHeight: '80%',
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
    maxHeight: 400,
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
});

export default KuryeProfile;
