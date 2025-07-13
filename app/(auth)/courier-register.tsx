import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, SafeAreaView, ActivityIndicator, ScrollView, Dimensions } from "react-native";
import { router } from "expo-router";
import { API_CONFIG, API_ENDPOINTS, getFullUrl } from "../../constants/api";
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width, height } = Dimensions.get('window');

const CourierRegister = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    // Türkiye telefon numarası formatları: 
    // 0555 123 4567, 555 123 4567, 05551234567, 5551234567
    const phoneRegex = /^(0?5\d{2}[\s-]?\d{3}[\s-]?\d{4}|0?5\d{9})$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
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
      Alert.alert("Hata", "Lütfen geçerli bir telefon numarası girin\nÖrnek: 0555 123 4567 veya 555 123 4567");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Hata", "Şifre en az 6 karakter olmalıdır");
      return;
    }

    setLoading(true);
    try {
      console.log("Attempting courier registration...");
      
      const response = await fetch(getFullUrl("/api/admin/couriers"), {
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
        }),
      });

      const data = await response.json();
      console.log("Registration response:", data);

      if (response.ok && data.success) {
        // Kayıt başarılı olduktan sonra otomatik giriş yap
        console.log("Registration successful, attempting auto login...");
        await handleAutoLogin(email, password);
      } else {
        Alert.alert("Hata", data.message || "Kayıt işlemi başarısız");
      }
    } catch (error) {
      console.error("Registration error:", error);
      Alert.alert("Hata", "Sunucu bağlantı hatası. İnternet bağlantınızı kontrol edin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
              <LinearGradient
        colors={['#3B82F6', '#1E40AF']}
        style={styles.gradient}
      >
        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.content}>
          {/* Header Section */}
          <View style={styles.headerSection}>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Text style={styles.backButtonText}>← Geri</Text>
            </TouchableOpacity>
          </View>
          
          {/* Form Section */}
          <View style={styles.formContainer}>
            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>👤 Ad Soyad</Text>
                <TextInput
                  style={[styles.input, name && name.length < 2 && styles.inputError]}
                  value={name}
                  onChangeText={setName}
                  placeholder="Adınız ve soyadınız"
                  placeholderTextColor="#9CA3AF"
                  autoCorrect={false}
                />
                {name && name.length < 2 && (
                  <Text style={styles.errorText}>⚠️ Ad soyad en az 2 karakter olmalıdır</Text>
                )}
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>📧 E-posta</Text>
                <TextInput
                  style={[styles.input, email && !validateEmail(email) && styles.inputError]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="ornek@email.com"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {email && !validateEmail(email) && (
                  <Text style={styles.errorText}>⚠️ Geçerli bir e-posta adresi girin</Text>
                )}
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>📱 Telefon</Text>
                <TextInput
                  style={[styles.input, phone && !validatePhone(phone) && styles.inputError]}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="0555 123 4567"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                  autoCorrect={false}
                />
                {phone && !validatePhone(phone) && (
                  <Text style={styles.errorText}>⚠️ Geçerli bir telefon numarası girin</Text>
                )}
              </View>
              
              <View style={styles.inputContainer}>
                <Text style={styles.label}>🔒 Şifre</Text>
                <View style={[styles.passwordContainer, password && password.length < 6 && styles.inputError]}>
                  <TextInput
                    style={styles.passwordInput}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="En az 6 karakter"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showPassword}
                    autoCorrect={false}
                  />
                  <TouchableOpacity 
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Text style={styles.eyeIcon}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
                  </TouchableOpacity>
                </View>
                {password && password.length < 6 && (
                  <Text style={styles.errorText}>⚠️ Şifre en az 6 karakter olmalıdır</Text>
                )}
              </View>


              
              {/* Register Button */}
              <TouchableOpacity 
                style={[styles.registerButton, loading && styles.buttonDisabled]} 
                onPress={handleRegister}
                disabled={loading}
              >
                <LinearGradient
                  colors={loading ? ['#9CA3AF', '#6B7280'] : ['#10B981', '#059669']}
                  style={styles.buttonGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Text style={styles.buttonText}>Kayıt Ol</Text>
                      <Text style={styles.buttonIcon}>→</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {/* Login Link */}
              <TouchableOpacity 
                style={styles.loginLinkContainer}
                onPress={() => router.replace("/(auth)/sign-in")}
              >
                <Text style={styles.loginLinkText}>Zaten hesabınız var mı? Giriş yapın</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  headerSection: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 15,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  logoContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  logoText: {
    fontSize: 22,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },
  formContainer: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  form: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#374151',
  },
  input: {
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#F9FAFB',
    color: '#111827',
    fontWeight: '500',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
  },
  passwordInput: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
  },
  eyeButton: {
    padding: 16,
  },
  eyeIcon: {
    fontSize: 18,
  },
  helperText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    fontStyle: 'italic',
  },
  registerButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    marginBottom: 16,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 8,
  },
  buttonIcon: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loginLinkContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  loginLinkText: {
    color: '#6366F1',
    fontSize: 14,
    fontWeight: '600',
  },
  inputError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
});

export default CourierRegister; 