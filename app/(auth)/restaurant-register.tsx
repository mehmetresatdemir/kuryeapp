import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, StatusBar, Modal } from "react-native";
import { router } from "expo-router";
import { getFullUrl } from "../../constants/api";
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

import { 
  Storefront, 
  User, 
  Envelope, 
  Phone, 
  Lock, 
  Eye, 
  EyeSlash, 
  UserPlus, 
  ArrowLeft, 
  Check, 
  X 
} from "phosphor-react-native";

const RestaurantRegister = () => {
  const [name, setName] = useState(""); // Restaurant name
  const [yetkilName, setYetkilName] = useState(""); // Authorized person name
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  
  // Location states
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  const handleAutoLogin = async (userEmail: string, userPassword: string) => {
    try {
      console.log("Attempting auto login...");
      
      const response = await fetch(getFullUrl("/api/login"), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: userEmail,
          password: userPassword,
        }),
      });

      const responseText = await response.text();
      console.log("Auto login response text:", responseText);
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("JSON parse error:", parseError);
        throw new Error("Sunucudan geçersiz yanıt alındı");
      }
      
      if (response.ok && data.success) {
        let user = data.user || data.restaurant || data.courier;
        
        if (user) {
          if (!user.role) {
            if (data.restaurant) {
              user.role = 'restaurant';
            } else if (data.courier) {
              user.role = 'courier';
            }
          }
        }
        
        console.log("Auto login processed user:", JSON.stringify(user, null, 2));

        if (user && user.id) {
          try {
            const userDataString = JSON.stringify(user);
            const userIdString = user.id.toString();
            const userToken = data.token;

            await AsyncStorage.setItem('userData', userDataString);
            await AsyncStorage.setItem('userId', userIdString);
            if (userToken) {
              await AsyncStorage.setItem('userToken', userToken);
            }
            
            console.log(`--- Auto login AsyncStorage kaydetme başarılı ---`);
            
            // Bildirim sistemi kaldırıldı
            
            // Ana sayfaya yönlendir
            router.replace("/");
          } catch (storageError) {
            console.error("Auto login AsyncStorage hatası:", storageError);
            Alert.alert("Hata", "Oturum bilgileri kaydedilemedi.");
            router.replace("/(auth)/sign-in");
          }
        } else {
          console.error("Auto login: Kullanıcı nesnesi alınamadı!");
          Alert.alert("Hata", "Giriş başarılı fakat kullanıcı verisi işlenemedi.");
          router.replace("/(auth)/sign-in");
        }
      } else {
        Alert.alert("Hata", "Otomatik giriş yapılamadı. Lütfen manuel giriş yapın.");
        router.replace("/(auth)/sign-in");
      }
    } catch (error) {
      console.error("Auto login error:", error);
      Alert.alert("Hata", "Otomatik giriş yapılamadı. Lütfen manuel giriş yapın.");
      router.replace("/(auth)/sign-in");
    }
  };

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePhone = (phone: string) => {
    // Telefon numarası 11 karakterden fazla olmasın
    const cleanPhone = phone.replace(/\s/g, '');
    if (cleanPhone.length > 11) {
      return false;
    }
    
    // Türkiye telefon numarası formatları: 
    // 0555 123 4567, 555 123 4567, 05551234567, 5551234567
    const phoneRegex = /^(0?5\d{2}[\s-]?\d{3}[\s-]?\d{4}|0?5\d{9})$/;
    return phoneRegex.test(cleanPhone);
  };

  const handleGetLocation = async () => {
    try {
      setGettingLocation(true);
      
      // Konum izni iste
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('İzin Gerekli', 'Konum bilgisini almak için konum izni gereklidir.');
        return;
      }

      // Mevcut konumu al
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = location.coords;
      setSelectedLocation({ latitude, longitude });
      
      Alert.alert(
        'Konum Alındı', 
        `Restoran konumunuz belirlendi.\nLatitude: ${latitude.toFixed(6)}\nLongitude: ${longitude.toFixed(6)}`,
        [{ text: 'Tamam', onPress: () => setLocationModalVisible(false) }]
      );
    } catch (error) {
      console.error('Location error:', error);
      Alert.alert('Hata', 'Konum alınırken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setGettingLocation(false);
    }
  };

  const openLocationModal = () => {
    setLocationModalVisible(true);
  };

  const handleRegister = async () => {
    if (!name || !yetkilName || !email || !password || !phone) {
      Alert.alert("Hata", "Lütfen tüm alanları doldurun");
      return;
    }

    if (!selectedLocation) {
      Alert.alert("Konum Gerekli", "Lütfen restoran konumunu belirleyin", [
        { text: 'Konumu Belirle', onPress: openLocationModal }
      ]);
      return;
    }

    if (name.length < 2) {
      Alert.alert("Hata", "Restoran adı en az 2 karakter olmalıdır");
      return;
    }

    if (yetkilName.length < 2) {
      Alert.alert("Hata", "Yetkili adı en az 2 karakter olmalıdır");
      return;
    }

    if (!validateEmail(email)) {
      Alert.alert("Hata", "Lütfen geçerli bir e-posta adresi girin\nÖrnek: ornek@email.com");
      return;
    }

    if (!validatePhone(phone)) {
      Alert.alert("Hata", "Lütfen geçerli bir telefon numarası girin (max 11 karakter)\nÖrnek: 0555 123 4567 veya 555 123 4567");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Hata", "Şifre en az 6 karakter olmalıdır");
      return;
    }

    setLoading(true);
    try {
      console.log("Attempting restaurant registration...");
      
      const response = await fetch(getFullUrl("/api/restaurants/register"), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name,
          yetkili_name: yetkilName,
          email: email,
          password: password,
          phone: phone,
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
        }),
      });

      const data = await response.json();
      console.log("Restaurant registration response:", data);

      if (response.ok && data.success) {
        // Kayıt başarılı olduktan sonra otomatik giriş yap
        console.log("Restaurant registration successful, attempting auto login...");
        await handleAutoLogin(email, password);
      } else {
        // Backend'den gelen hata mesajlarını Türkçe olarak göster
        let errorMessage = "Kayıt işlemi başarısız";
        
        if (data.message) {
          const message = data.message.toLowerCase();
          if (message.includes('email') && message.includes('already')) {
            errorMessage = "Bu e-posta adresi zaten kayıtlı. Lütfen farklı bir e-posta adresi deneyin.";
          } else if (message.includes('phone') && message.includes('already')) {
            errorMessage = "Bu telefon numarası zaten kayıtlı. Lütfen farklı bir telefon numarası deneyin.";
          } else if (message.includes('duplicate') && message.includes('email')) {
            errorMessage = "Bu e-posta adresi zaten kayıtlı. Lütfen farklı bir e-posta adresi deneyin.";
          } else if (message.includes('duplicate') && message.includes('phone')) {
            errorMessage = "Bu telefon numarası zaten kayıtlı. Lütfen farklı bir telefon numarası deneyin.";
          } else {
            errorMessage = data.message;
          }
        }
        
        Alert.alert("Hata", errorMessage);
      }
    } catch (error) {
      console.error("Restaurant registration error:", error);
      Alert.alert("Hata", "Sunucu bağlantı hatası. İnternet bağlantınızı kontrol edin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" translucent={true} />
      <LinearGradient
        colors={['#0F172A', '#1E293B', '#334155']}
        style={styles.gradient}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoidingView}
        >
          <ScrollView 
            style={styles.scrollContainer} 
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {/* Header Section */}
            <View style={styles.headerSection}>
              <TouchableOpacity 
                style={styles.backButton}
                onPress={() => router.back()}
              >
                <ArrowLeft size={20} color="#FFFFFF" weight="bold" />
                <Text style={styles.backButtonText}>Geri</Text>
              </TouchableOpacity>
              
              <View style={styles.titleContainer}>
                <View style={styles.iconContainer}>
                  <Storefront size={32} color="#10B981" weight="duotone" />
                </View>
                <Text style={styles.title}>Restoran Kayıt</Text>
                <Text style={styles.subtitle}>İşletmenizi platform'a ekleyin</Text>
              </View>
            </View>
            
            {/* Form Section */}
            <View style={styles.formContainer}>
              <View style={styles.form}>
                {/* Restaurant Name Input */}
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Restoran Adı</Text>
                  <View style={[
                    styles.inputWrapper,
                    focusedInput === 'name' && styles.inputWrapperFocused,
                    name && name.length < 2 && styles.inputWrapperError
                  ]}>
                    <Storefront 
                      size={20} 
                      color={focusedInput === 'name' ? '#3B82F6' : '#6B7280'} 
                      weight="duotone"
                    />
                    <TextInput
                      style={styles.input}
                      value={name}
                      onChangeText={setName}
                      placeholder="Restoran adınız"
                      placeholderTextColor="#9CA3AF"
                      autoCorrect={false}
                      onFocus={() => setFocusedInput('name')}
                      onBlur={() => setFocusedInput(null)}
                    />
                    {name && name.length >= 2 && (
                      <Check size={20} color="#10B981" weight="bold" />
                    )}
                    {name && name.length < 2 && name.length > 0 && (
                      <X size={20} color="#EF4444" weight="bold" />
                    )}
                  </View>
                  {name && name.length < 2 && (
                    <Text style={styles.errorText}>Restoran adı en az 2 karakter olmalıdır</Text>
                  )}
                </View>

                {/* Authorized Person Name Input */}
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Yetkili Adı</Text>
                  <View style={[
                    styles.inputWrapper,
                    focusedInput === 'yetkilName' && styles.inputWrapperFocused,
                    yetkilName && yetkilName.length < 2 && styles.inputWrapperError
                  ]}>
                    <User 
                      size={20} 
                      color={focusedInput === 'yetkilName' ? '#3B82F6' : '#6B7280'} 
                      weight="duotone"
                    />
                    <TextInput
                      style={styles.input}
                      value={yetkilName}
                      onChangeText={setYetkilName}
                      placeholder="Yetkili kişinin adı"
                      placeholderTextColor="#9CA3AF"
                      autoCorrect={false}
                      onFocus={() => setFocusedInput('yetkilName')}
                      onBlur={() => setFocusedInput(null)}
                    />
                    {yetkilName && yetkilName.length >= 2 && (
                      <Check size={20} color="#10B981" weight="bold" />
                    )}
                    {yetkilName && yetkilName.length < 2 && yetkilName.length > 0 && (
                      <X size={20} color="#EF4444" weight="bold" />
                    )}
                  </View>
                  {yetkilName && yetkilName.length < 2 && (
                    <Text style={styles.errorText}>Yetkili adı en az 2 karakter olmalıdır</Text>
                  )}
                </View>

                {/* Email Input */}
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>E-posta Adresi</Text>
                  <View style={[
                    styles.inputWrapper,
                    focusedInput === 'email' && styles.inputWrapperFocused,
                    email && !validateEmail(email) && styles.inputWrapperError
                  ]}>
                    <Envelope 
                      size={20} 
                      color={focusedInput === 'email' ? '#3B82F6' : '#6B7280'} 
                      weight="duotone"
                    />
                    <TextInput
                      style={styles.input}
                      value={email}
                      onChangeText={setEmail}
                      placeholder="ornek@email.com"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      onFocus={() => setFocusedInput('email')}
                      onBlur={() => setFocusedInput(null)}
                    />
                    {email && validateEmail(email) && (
                      <Check size={20} color="#10B981" weight="bold" />
                    )}
                    {email && !validateEmail(email) && email.length > 0 && (
                      <X size={20} color="#EF4444" weight="bold" />
                    )}
                  </View>
                  {email && !validateEmail(email) && (
                    <Text style={styles.errorText}>Geçerli bir e-posta adresi girin</Text>
                  )}
                </View>

                {/* Phone Input */}
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Telefon Numarası</Text>
                  <View style={[
                    styles.inputWrapper,
                    focusedInput === 'phone' && styles.inputWrapperFocused,
                    phone && !validatePhone(phone) && styles.inputWrapperError
                  ]}>
                    <Phone 
                      size={20} 
                      color={focusedInput === 'phone' ? '#3B82F6' : '#6B7280'} 
                      weight="duotone"
                    />
                    <TextInput
                      style={styles.input}
                      value={phone}
                      onChangeText={(text) => {
                        // Maksimum 11 karakter (boşluklar hariç)
                        const cleanText = text.replace(/\s/g, '');
                        if (cleanText.length <= 11) {
                          setPhone(text);
                        }
                      }}
                      placeholder="0555 123 4567"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="phone-pad"
                      autoCorrect={false}
                      onFocus={() => setFocusedInput('phone')}
                      onBlur={() => setFocusedInput(null)}
                      maxLength={14} // Boşluklar dahil maksimum karakter
                    />
                    {phone && validatePhone(phone) && (
                      <Check size={20} color="#10B981" weight="bold" />
                    )}
                    {phone && !validatePhone(phone) && phone.length > 0 && (
                      <X size={20} color="#EF4444" weight="bold" />
                    )}
                  </View>
                  {phone && !validatePhone(phone) && (
                    <Text style={styles.errorText}>
                      Geçerli bir telefon numarası girin (max 11 karakter)
                    </Text>
                  )}
                </View>
                
                {/* Password Input */}
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Şifre</Text>
                  <View style={[
                    styles.inputWrapper,
                    focusedInput === 'password' && styles.inputWrapperFocused,
                    password && password.length < 6 && styles.inputWrapperError
                  ]}>
                    <Lock 
                      size={20} 
                      color={focusedInput === 'password' ? '#3B82F6' : '#6B7280'} 
                      weight="duotone"
                    />
                    <TextInput
                      style={styles.input}
                      value={password}
                      onChangeText={setPassword}
                      placeholder="En az 6 karakter"
                      placeholderTextColor="#9CA3AF"
                      secureTextEntry={!showPassword}
                      autoCorrect={false}
                      onFocus={() => setFocusedInput('password')}
                      onBlur={() => setFocusedInput(null)}
                    />
                    <TouchableOpacity 
                      style={styles.eyeButton}
                      onPress={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeSlash size={20} color="#6B7280" />
                      ) : (
                        <Eye size={20} color="#6B7280" />
                      )}
                    </TouchableOpacity>
                    {password && password.length >= 6 && (
                      <Check size={20} color="#10B981" weight="bold" />
                    )}
                  </View>
                  {password && password.length < 6 && (
                    <Text style={styles.errorText}>Şifre en az 6 karakter olmalıdır</Text>
                  )}
                </View>

                {/* Location Section */}
                <View style={styles.locationSection}>
                  <Text style={styles.locationSectionTitle}>Restoran Konumu</Text>
                  <Text style={styles.locationSectionSubtitle}>
                    Kuryelerin sizi kolayca bulabilmesi için restoran konumunuzu belirleyin
                  </Text>
                  
                  <TouchableOpacity
                    style={[styles.locationButton, selectedLocation && styles.locationButtonSelected]}
                    onPress={openLocationModal}
                  >
                    <Ionicons 
                      name={selectedLocation ? "checkmark-circle" : "location-outline"} 
                      size={20} 
                      color={selectedLocation ? "#10B981" : "#6B7280"} 
                    />
                    <Text style={[styles.locationButtonText, selectedLocation && styles.locationButtonTextSelected]}>
                      {selectedLocation ? 'Konum Belirlendi' : 'Konumu Belirle'}
                    </Text>
                  </TouchableOpacity>

                  {selectedLocation && (
                    <View style={styles.selectedLocationInfo}>
                      <Text style={styles.coordinatesText}>
                        📍 {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Register Button */}
                <TouchableOpacity 
                  style={[styles.registerButton, loading && styles.buttonDisabled]} 
                  onPress={handleRegister}
                  disabled={loading}
                >
                  <LinearGradient
                    colors={loading ? ['#6B7280', '#4B5563'] : ['#10B981', '#059669']}
                    style={styles.buttonGradient}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <UserPlus size={20} color="#fff" weight="bold" />
                        <Text style={styles.buttonText}>Kayıt Ol</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                {/* Login Link */}
                <View style={styles.loginLinkContainer}>
                  <Text style={styles.loginLinkLabel}>Zaten hesabınız var mı?</Text>
                  <TouchableOpacity 
                    onPress={() => router.replace("/(auth)/sign-in")}
                  >
                    <Text style={styles.loginLinkText}>Giriş yapın</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>

      {/* Location Modal */}
      <Modal
        visible={locationModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setLocationModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Restoran Konumu</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setLocationModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.modalDescription}>
                Restoranınızın bulunduğu konumu belirleyin. Bu bilgi kuryelerin sizi kolayca bulması için kullanılacaktır.
              </Text>

              {selectedLocation ? (
                <View style={styles.selectedLocationContainer}>
                  <View style={styles.miniMapContainer}>
                    <MapView
                      style={styles.miniMap}
                      initialRegion={{
                        latitude: selectedLocation.latitude,
                        longitude: selectedLocation.longitude,
                        latitudeDelta: 0.005,
                        longitudeDelta: 0.005,
                      }}
                      scrollEnabled={false}
                      zoomEnabled={false}
                      rotateEnabled={false}
                      pitchEnabled={false}
                    >
                      <Marker
                        coordinate={selectedLocation}
                        title="Restoran Konumu"
                      >
                        <View style={styles.customMarker}>
                          <Ionicons name="restaurant" size={20} color="#FFFFFF" />
                        </View>
                      </Marker>
                    </MapView>
                  </View>
                  <Text style={styles.coordinatesTextModal}>
                    📍 Konum: {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
                  </Text>
                </View>
              ) : (
                <View style={styles.noLocationContainer}>
                  <Ionicons name="map-outline" size={48} color="#6B7280" />
                  <Text style={styles.noLocationText}>Henüz konum belirlenmedi</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.getLocationButton, { opacity: gettingLocation ? 0.7 : 1 }]}
                onPress={handleGetLocation}
                disabled={gettingLocation}
              >
                <Ionicons 
                  name={gettingLocation ? "hourglass-outline" : "location"} 
                  size={20} 
                  color="#FFFFFF" 
                />
                <Text style={styles.getLocationButtonText}>
                  {gettingLocation ? 'Konum Alınıyor...' : 'Mevcut Konumumu Al'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setLocationModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>İptal</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingTop: StatusBar.currentHeight || 0,
  },
  gradient: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  headerSection: {
    paddingBottom: 32,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 24,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  titleContainer: {
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#94A3B8',
    textAlign: 'center',
    fontWeight: '500',
  },
  formContainer: {
    flex: 1,
  },
  form: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 24,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.1,
    shadowRadius: 32,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
    color: '#374151',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 16,
    paddingVertical: 4,
    minHeight: 54,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  inputWrapperFocused: {
    borderColor: '#3B82F6',
    backgroundColor: '#FFFFFF',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  inputWrapperError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
    paddingLeft: 12,
    paddingRight: 12,
  },
  eyeButton: {
    padding: 4,
    marginRight: 4,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  registerButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
    marginTop: 8,
    marginBottom: 24,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  loginLinkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  loginLinkLabel: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '500',
  },
  loginLinkText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
  
  // Location styles
  locationSection: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  locationSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  locationSectionSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 18,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  locationButtonSelected: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  locationButtonText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  locationButtonTextSelected: {
    color: '#10B981',
  },
  selectedLocationInfo: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  coordinatesText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
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
  },
  modalDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 20,
    textAlign: 'center',
  },
  selectedLocationContainer: {
    marginBottom: 20,
  },
  miniMapContainer: {
    marginBottom: 12,
  },
  miniMap: {
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  customMarker: {
    backgroundColor: '#10B981',
    width: 36,
    height: 36,
    borderRadius: 18,
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
  coordinatesTextModal: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  noLocationContainer: {
    alignItems: 'center',
    padding: 32,
    marginBottom: 20,
  },
  noLocationText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 12,
    textAlign: 'center',
  },
  getLocationButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  getLocationButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default RestaurantRegister; 