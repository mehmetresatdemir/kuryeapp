import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, StatusBar, Modal } from "react-native";
import { router } from "expo-router";
import { getFullUrl, API_ENDPOINTS } from "../../constants/api";
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import Slider from '@react-native-community/slider';
// import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { Ionicons } from '@expo/vector-icons';

import { 
  User, 
  Envelope, 
  Phone, 
  Lock, 
  Eye, 
  EyeSlash, 
  UserPlus, 
  ArrowLeft, 
  Check, 
  X, 
  Bicycle,
  MapPin,
  Gauge
} from "phosphor-react-native";

const CourierRegister = () => {
  const [name, setName] = useState("");
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
  const [kmRadius, setKmRadius] = useState(10); // Default 10km
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [loadingRestaurants, setLoadingRestaurants] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [mapRef, setMapRef] = useState<any>(null);
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Modal açıldığında restoranları yükle ve seçili konuma odakla
  React.useEffect(() => {
    if (locationModalVisible) {
      console.log('🏪 Modal açıldı, restoranları yükleniyor...');
      loadRestaurants();
    }
  }, [locationModalVisible]);

  // Harita hazır olduğunda ve selectedLocation varsa odakla
  React.useEffect(() => {
    if (mapRef && selectedLocation && locationModalVisible) {
      console.log('📍 Seçili konuma odaklanılıyor:', selectedLocation);
      setTimeout(() => {
        mapRef.animateToRegion({
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }, 1000);
      }, 100);
    }
  }, [mapRef, selectedLocation, locationModalVisible]);

  const getCurrentLocation = async () => {
    // Eğer daha önce konum seçilmişse, direkt modal'ı aç
    if (selectedLocation) {
      console.log('🗺️ Konum modal açılıyor, mevcut selectedLocation:', selectedLocation);
      setLocationModalVisible(true);
      return;
    }

    // Konum yoksa GPS'den al
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('İzin Gerekli', 'Konum izni vermeden devam edemezsiniz');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setSelectedLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      setLocationModalVisible(true);
    } catch (error) {
      console.error('Konum alınırken hata:', error);
      Alert.alert('Hata', 'Konum bilgisi alınamadı. Lütfen tekrar deneyin.');
    } finally {
      setGettingLocation(false);
    }
  };

  const handleMapPress = (event: any) => {
    const { coordinate } = event.nativeEvent;
    setSelectedLocation({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
    });
  };

  const loadRestaurants = async () => {
    setLoadingRestaurants(true);
    try {
      console.log('🔄 Restoranları yükleme başlıyor...');
      // Doğru endpoint'i kullan - auth header ile
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch(getFullUrl(API_ENDPOINTS.GET_ALL_RESTAURANTS), {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
        },
      });
      console.log('📡 API Response status:', response.status);
      
      const data = await response.json();
      console.log('📋 API Response structure:', {
        success: data.success,
        dataLength: data.data?.length || 0,
        hasData: !!data.data
      });
      
      if (data.success && data.data) {
        console.log('📊 Toplam restoran sayısı:', data.data.length);
        
        // Tüm restoranların koordinat durumunu kontrol et
        data.data.forEach((restaurant: any, index: number) => {
          console.log(`🏪 ${index + 1}:`, {
            firma_adi: restaurant.firma_adi,
            name: restaurant.name,
            yetkili_name: restaurant.yetkili_name,
            latitude: restaurant.latitude,
            longitude: restaurant.longitude
          });
        });
        
        // Sadece konum bilgisi olan restoranları filtrele
        const restaurantsWithLocation = data.data.filter((restaurant: any) => 
          restaurant.latitude && restaurant.longitude && 
          restaurant.latitude !== '0' && restaurant.longitude !== '0' &&
          restaurant.latitude !== 0 && restaurant.longitude !== 0
        );
        
        setRestaurants(restaurantsWithLocation);
        console.log(`✅ ${restaurantsWithLocation.length} restoran geçerli konum bilgisi ile filtrelendi`);
        console.log('📍 Filtrelenmiş restoran listesi:', restaurantsWithLocation.slice(0, 3));
      } else {
        console.log('❌ API başarısız:', data);
      }
    } catch (error) {
      console.error('❌ Restoranlar yüklenirken hata:', error);
    } finally {
      setLoadingRestaurants(false);
    }
  };

  const fetchSearchSuggestions = async (query: string) => {
    if (!query.trim() || query.length < 3) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=tr&limit=5&addressdetails=1`
      );
      const data = await response.json();
      
      if (data && data.length > 0) {
        setSearchSuggestions(data);
        setShowSuggestions(true);
      } else {
        setSearchSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error('Öneri arama hatası:', error);
      setSearchSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (suggestion: any) => {
    const location = {
      latitude: parseFloat(suggestion.lat),
      longitude: parseFloat(suggestion.lon),
    };
    
    setSelectedLocation(location);
    setSearchText(suggestion.display_name);
    setShowSuggestions(false);
    
    // Haritayı bulunan konuma odakla
    if (mapRef) {
      mapRef.animateToRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    }
    
    console.log('Öneri seçildi:', location);
  };

  const searchLocation = async (query: string) => {
    if (!query.trim()) return;
    
    try {
      // Basit geocoding API kullan (ücretsiz)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=tr&limit=5&addressdetails=1`
      );
      const data = await response.json();
      
      if (data && data.length > 0) {
        const firstResult = data[0];
        const location = {
          latitude: parseFloat(firstResult.lat),
          longitude: parseFloat(firstResult.lon),
        };
        setSelectedLocation(location);
        setSearchText(firstResult.display_name);
        setShowSuggestions(false);
        
        // Haritayı bulunan konuma odakla
        if (mapRef) {
          mapRef.animateToRegion({
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }, 1000);
        }
        
        console.log('Konum bulundu:', location);
      } else {
        Alert.alert("Bulunamadı", "Bu adres için konum bulunamadı. Lütfen farklı bir arama deneyin.");
      }
    } catch (error) {
      console.error('Konum arama hatası:', error);
      Alert.alert("Hata", "Konum arama sırasında bir hata oluştu.");
    }
  };

  // Label pozisyonu hesaplama - çakışmayı önlemek için
  const getLabelOffset = (index: number) => {
    const positions = [
      { marginTop: 4, marginLeft: 0 },      // Alt merkez (varsayılan)
      { marginTop: 4, marginLeft: 30 },     // Alt sağ
      { marginTop: 4, marginLeft: -30 },    // Alt sol  
      { marginTop: -35, marginLeft: 20 },   // Üst sağ
      { marginTop: -35, marginLeft: -20 },  // Üst sol
      { marginTop: 4, marginLeft: 50 },     // Sağ uzak
      { marginTop: 4, marginLeft: -50 },    // Sol uzak
      { marginTop: -35, marginLeft: 0 },    // Üst merkez
    ];
    
    return positions[index % positions.length];
  };

  const handleRestaurantPress = (restaurant: any) => {
    const location = {
      latitude: parseFloat(restaurant.latitude),
      longitude: parseFloat(restaurant.longitude),
    };
    setSelectedLocation(location);
    
    // Haritayı restoran konumuna odakla
    if (mapRef) {
      mapRef.animateToRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    }
    
    Alert.alert(
      "Restoran Konumu Seçildi",
      `${restaurant.name} restoranının konumu seçildi. Bu konumu Çalışma konumunuz olarak kullanmak istiyor musunuz?`,
      [
        { text: "Hayır", style: "cancel" },
        { text: "Evet", style: "default" }
      ]
    );
  };

  const handleZoomIn = () => {
    if (mapRef && selectedLocation) {
      // Region bazlı zoom in
      mapRef.animateToRegion({
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        latitudeDelta: 0.005, // Daha yakın zoom
        longitudeDelta: 0.005,
      }, 500);
    }
  };

  const handleZoomOut = () => {
    if (mapRef && selectedLocation) {
      // Şehir seviyesi zoom out  
      mapRef.animateToRegion({
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        latitudeDelta: 0.1, // Şehir seviyesi
        longitudeDelta: 0.1,
      }, 500);
    }
  };

  const handleAutoLogin = async (userEmail: string, userPassword: string) => {
    try {
      console.log("Attempting auto login...");
      console.log("Email:", userEmail);
      console.log("Password:", userPassword);
      
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

      console.log("Auto login response status:", response.status);
      const responseText = await response.text();
      console.log("Auto login response text:", responseText);
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("JSON parse error:", parseError);
        console.error("Response text that failed to parse:", responseText);
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
            
            // Ana sayfaya yönlendir (sign-in ile aynı şekilde)
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

  const handleRegister = async () => {
    if (!name || !email || !password || !phone) {
      Alert.alert("Hata", "Lütfen tüm alanları doldurun");
      return;
    }

    if (name.length < 2) {
      Alert.alert("Hata", "Ad soyad en az 2 karakter olmalıdır");
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

    if (!selectedLocation) {
      Alert.alert("Konum Gerekli", "Lütfen Çalışma konumunuzu işaretleyin. Bu konum etrafında bildirim alacağınız alanı belirler.");
      return;
    }

    setLoading(true);
    try {
      console.log("Attempting courier registration...");
      
      const response = await fetch(getFullUrl("/api/couriers/register"), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name,
          email: email,
          password: password,
          phone: phone,
          package_limit: 5,
          home_latitude: selectedLocation.latitude,
          home_longitude: selectedLocation.longitude,
          km_radius: kmRadius,
        }),
      });

      const data = await response.json();
      console.log("Registration response:", data);

      if (response.ok && data.success) {
        // Kayıt başarılı olduktan sonra otomatik giriş yap
        console.log("Registration successful, attempting auto login...");
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
      console.error("Registration error:", error);
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
                  <Bicycle size={32} color="#F59E0B" weight="duotone" />
                </View>
                <Text style={styles.title}>Kurye Kayıt</Text>
                <Text style={styles.subtitle}>Kurye olarak platform'a katılın</Text>
              </View>
            </View>
            
            {/* Form Section */}
            <View style={styles.formContainer}>
              <View style={styles.form}>
                {/* Name Input */}
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Ad Soyad</Text>
                  <View style={[
                    styles.inputWrapper,
                    focusedInput === 'name' && styles.inputWrapperFocused,
                    name && name.length < 2 && styles.inputWrapperError
                  ]}>
                    <User 
                      size={20} 
                      color={focusedInput === 'name' ? '#3B82F6' : '#6B7280'} 
                      weight="duotone"
                    />
                    <TextInput
                      style={styles.input}
                      value={name}
                      onChangeText={setName}
                      placeholder="Adınız ve soyadınız"
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
                    <Text style={styles.errorText}>Ad soyad en az 2 karakter olmalıdır</Text>
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

                {/* Location Selection */}
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Çalışma Konumu</Text>
                  <TouchableOpacity 
                    style={[
                      styles.locationButton,
                      selectedLocation && styles.locationButtonSelected
                    ]}
                    onPress={getCurrentLocation}
                    disabled={gettingLocation}
                  >
                    <MapPin 
                      size={20} 
                      color={selectedLocation ? '#10B981' : '#6B7280'} 
                      weight="duotone"
                    />
                    {gettingLocation ? (
                      <ActivityIndicator size="small" color="#6B7280" style={{ marginLeft: 8 }} />
                    ) : (
                      <Text style={[
                        styles.locationButtonText,
                        selectedLocation && styles.locationButtonTextSelected
                      ]}>
                        {selectedLocation ? '✓ Konum Seçildi' : 'Konumu Seç'}
                      </Text>
                    )}
                  </TouchableOpacity>
                  <Text style={styles.helperText}>
                    Bu konum etrafında {kmRadius}km çapında bildirim alacaksınız
                  </Text>
                </View>

                {/* KM Radius Slider */}
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Bildirim Mesafesi: {kmRadius} km</Text>
                  <View style={styles.sliderContainer}>
                    <Gauge size={20} color="#6B7280" weight="duotone" />
                    <Slider
                      style={styles.slider}
                      minimumValue={0}
                      maximumValue={100}
                      value={kmRadius}
                      step={5}
                      onValueChange={setKmRadius}
                      minimumTrackTintColor="#3B82F6"
                      maximumTrackTintColor="#E5E7EB"

                    />
                    <Text style={styles.sliderValue}>{kmRadius}km</Text>
                  </View>
                  <Text style={styles.helperText}>
                    0km = Sadece mevcut konumunuz, 100km = Geniş alan
                  </Text>
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

                {/* Register Button */}
                <TouchableOpacity 
                  style={[styles.registerButton, loading && styles.buttonDisabled]} 
                  onPress={handleRegister}
                  disabled={loading}
                >
                  <LinearGradient
                    colors={loading ? ['#6B7280', '#4B5563'] : ['#F59E0B', '#D97706']}
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

        {/* Location Selection Modal */}
        <Modal
          visible={locationModalVisible}
          animationType="slide"
          onRequestClose={() => setLocationModalVisible(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setLocationModalVisible(false)}
              >
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Konum Seçin</Text>
              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={() => setLocationModalVisible(false)}
                disabled={!selectedLocation}
              >
                <Check size={24} color={selectedLocation ? "#10B981" : "#9CA3AF"} />
              </TouchableOpacity>
            </View>

            {/* Address Search */}
            <View style={styles.searchContainer}>
              <View style={styles.searchInputContainer}>
                <View style={styles.searchIcon}>
                  <Ionicons name="search" size={20} color="#6B7280" />
                </View>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Adres ara... (örn: Gaziantep Şahinbey)"
                  placeholderTextColor="#9CA3AF"
                  value={searchText}
                  onChangeText={(text) => {
                    setSearchText(text);
                    fetchSearchSuggestions(text);
                  }}
                  onSubmitEditing={() => {
                    searchLocation(searchText);
                    setShowSuggestions(false);
                  }}
                  onFocus={() => {
                    if (searchText.length >= 3) {
                      setShowSuggestions(true);
                    }
                  }}
                  onBlur={() => {
                    // Kısa bir delay ile kapat (öneri seçme şansı ver)
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  returnKeyType="search"
                />
                <TouchableOpacity 
                  style={styles.searchButton}
                  onPress={() => searchLocation(searchText)}
                  disabled={!searchText.trim()}
                >
                  <Ionicons 
                    name="arrow-forward" 
                    size={16} 
                    color={searchText.trim() ? "#FFFFFF" : "#9CA3AF"} 
                  />
                </TouchableOpacity>
              </View>
              <Text style={styles.searchHint}>
                💡 Şehir, ilçe veya mahalle adı girin
              </Text>
              
              {/* Search Suggestions */}
              {showSuggestions && searchSuggestions.length > 0 && (
                <View style={styles.suggestionsContainer}>
                  {searchSuggestions.map((suggestion, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.suggestionItem}
                      onPress={() => selectSuggestion(suggestion)}
                    >
                      <Ionicons name="location-outline" size={16} color="#6B7280" />
                      <Text style={styles.suggestionText} numberOfLines={2}>
                        {suggestion.display_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>



              <View style={styles.mapContainer}>
                <MapView
                  ref={setMapRef}
                  style={styles.map}
                  initialRegion={{
                    latitude: selectedLocation ? selectedLocation.latitude : 37.0662, // Varsayılan: Gaziantep
                    longitude: selectedLocation ? selectedLocation.longitude : 37.3833,
                    latitudeDelta: 0.1, // Daha geniş başlangıç görünümü
                    longitudeDelta: 0.1,
                  }}
                  onPress={handleMapPress}
                  showsUserLocation={true}
                  showsMyLocationButton={false}
                  onMapReady={() => {
                    console.log(`🗺️ Harita hazır! Restoran sayısı: ${restaurants.length}`);
                    restaurants.forEach((r, i) => {
                      console.log(`🏪 ${i+1}: ${r.name} - ${r.latitude}, ${r.longitude}`);
                    });
                    
                    // Harita hazır olduğunda seçili konuma odakla
                    if (selectedLocation && mapRef) {
                      console.log('📍 Harita hazır - seçili konuma odaklanılıyor:', selectedLocation);
                      setTimeout(() => {
                        mapRef.animateToRegion({
                          latitude: selectedLocation.latitude,
                          longitude: selectedLocation.longitude,
                          latitudeDelta: 0.1,
                          longitudeDelta: 0.1,
                        }, 500);
                      }, 200);
                    }
                  }}
                >
                {/* User's selected location marker */}
                {selectedLocation && (
                  <Marker
                    coordinate={selectedLocation}
                    title="Çalışma Konumunuz"
                    description="Bu konum etrafında bildirim alacaksınız"
                    draggable={true}
                    onDragStart={() => {
                      console.log('Marker sürükleme başladı');
                    }}
                    onDragEnd={(e) => {
                      const { coordinate } = e.nativeEvent;
                      console.log('Marker yeni konuma taşındı:', coordinate);
                      setSelectedLocation({
                        latitude: coordinate.latitude,
                        longitude: coordinate.longitude,
                      });
                    }}
                    pinColor="red"
                  >
                    <View style={styles.customMarker}>
                      <MapPin size={30} color="#EF4444" weight="fill" />
                    </View>
                  </Marker>
                )}

                {/* Restaurant markers */}
                {restaurants.length > 0 && restaurants.map((restaurant, index) => {
                  const lat = parseFloat(restaurant.latitude);
                  const lng = parseFloat(restaurant.longitude);
                  console.log(`🏪 Restoran ${index + 1}/${restaurants.length}: ${restaurant.name} - Lat: ${lat}, Lng: ${lng}`);
                  
                  if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
                    console.log(`✅ Marker oluşturuluyor: ${restaurant.name}`);
                    // Her restoran için farklı label pozisyonu hesapla
                    const labelOffset = getLabelOffset(index);
                    
                    return (
                      <Marker
                        key={`restaurant-${restaurant.id || index}`}
                        coordinate={{
                          latitude: lat,
                          longitude: lng,
                        }}
                        title={restaurant.firma_adi || restaurant.name || 'İsimsiz Restoran'}
                        onPress={() => handleRestaurantPress(restaurant)}
                      >
                        <View style={styles.customMarkerContainer}>
                          <View style={styles.restaurantMarker}>
                            <Ionicons name="restaurant" size={26} color="#FFFFFF" />
                          </View>
                          <View style={[styles.markerLabel, labelOffset]}>
                            <Text style={styles.markerLabelText} numberOfLines={1}>
                              {restaurant.firma_adi || restaurant.name || 'İsimsiz'}
                            </Text>
                          </View>
                        </View>
                      </Marker>
                    );
                  } else {
                    console.log(`❌ Geçersiz koordinat: ${restaurant.name} - Lat: ${lat}, Lng: ${lng}`);
                  }
                  return null;
                })}
                
                {restaurants.length === 0 && (() => {
                  console.log('⚠️ Hiç restoran marker\'ı yok!');
                  return null;
                })()}

                {/* Test marker - Gaziantep merkezi */}
                <Marker
                  coordinate={{
                    latitude: 37.0662,
                    longitude: 37.3833,
                  }}
                  title="Test Marker"
                  description="Test için Gaziantep merkezi"
                >
                  <View style={styles.restaurantMarker}>
                    <Ionicons name="star" size={26} color="#FFFFFF" />
                  </View>
                </Marker>
              </MapView>
              
              {/* Zoom Controls */}
              <View style={styles.zoomControls}>
                <TouchableOpacity 
                  style={styles.zoomButton}
                  onPress={handleZoomIn}
                >
                  <Ionicons name="add" size={24} color="#374151" />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.zoomButton, styles.zoomButtonBottom]}
                  onPress={handleZoomOut}
                >
                  <Ionicons name="remove" size={24} color="#374151" />
                </TouchableOpacity>
              </View>

              {/* My Location Button */}
              <TouchableOpacity 
                style={styles.myLocationButton}
                onPress={async () => {
                  setGettingLocation(true);
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
                    
                    // Haritayı GPS konumuna odakla
                    if (mapRef) {
                      mapRef.animateToRegion({
                        latitude: newLocation.latitude,
                        longitude: newLocation.longitude,
                        latitudeDelta: 0.01,
                        longitudeDelta: 0.01,
                      }, 1000);
                    }
                  } catch (error) {
                    console.error('GPS konum alınırken hata:', error);
                    Alert.alert('Hata', 'GPS konumu alınamadı');
                  } finally {
                    setGettingLocation(false);
                  }
                }}
                disabled={gettingLocation}
              >
                {gettingLocation ? (
                  <ActivityIndicator size="small" color="#374151" />
                ) : (
                  <Ionicons name="locate" size={20} color="#374151" />
                )}
              </TouchableOpacity>
              </View>

            <View style={styles.modalFooter}>
              <Text style={styles.modalInstructions}>
                📍 <Text style={{fontWeight: 'bold'}}>Kırmızı iğneyi sürükleyin</Text> veya haritada dokunun{'\n'}
                🔍 <Text style={{fontWeight: 'bold'}}>Adres arayın</Text> veya {' '}
                📍 <Text style={{fontWeight: 'bold'}}>GPS butonuna</Text> basın{'\n'}
                🔍 <Text style={{fontWeight: 'bold'}}>+/- butonları</Text> ile yakınlaştırın/uzaklaştırın
              </Text>
              {selectedLocation && (
                <Text style={styles.modalCoordinates}>
                  Koordinatlar: {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
                </Text>
              )}
            </View>
          </View>
        </Modal>
      </LinearGradient>
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
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
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
    shadowColor: '#F59E0B',
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
  // Location Selection Styles
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 54,
  },
  locationButtonSelected: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  locationButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
    marginLeft: 12,
  },
  locationButtonTextSelected: {
    color: '#10B981',
  },
  helperText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    fontStyle: 'italic',
  },
  // KM Slider Styles
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  slider: {
    flex: 1,
    marginHorizontal: 12,
    height: 40,
  },

  sliderValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    minWidth: 40,
    textAlign: 'center',
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
  },
  modalCloseButton: {
    padding: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalSaveButton: {
    padding: 8,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  zoomControls: {
    position: 'absolute',
    right: 16,
    top: 16,
    flexDirection: 'column',
  },
  zoomButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  zoomButtonBottom: {
    marginTop: 8,
  },
  myLocationButton: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalFooter: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  modalInstructions: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalCoordinates: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  customMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  // Address Search Styles
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    paddingLeft: 12,
    paddingRight: 4,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  searchButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    padding: 8,
    marginLeft: 8,
  },
  searchHint: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 6,
    fontStyle: 'italic',
  },
  suggestionsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginTop: 8,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    marginLeft: 8,
  },
  // Restaurants List Styles
  restaurantsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  restaurantsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  restaurantsScroll: {
    paddingBottom: 4,
  },
  restaurantCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    minWidth: 120,
    maxWidth: 150,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  restaurantName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  restaurantDistance: {
    fontSize: 10,
    color: '#6B7280',
  },
  customMarkerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  restaurantMarker: {
    backgroundColor: '#10B981',
    borderRadius: 22,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 8,
  },
  markerLabel: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#10B981',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    maxWidth: 120,
  },
  markerLabelText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#10B981',
    textAlign: 'center',
  },
});

export default CourierRegister; 