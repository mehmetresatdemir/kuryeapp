import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, SafeAreaView, ActivityIndicator, ScrollView, Dimensions } from "react-native";
import { router } from "expo-router";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG, API_ENDPOINTS, getFullUrl } from "../../constants/api";
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

const SignIn = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Hata", "Lütfen e-posta ve şifre girin");
      return;
    }

    setLoading(true);
    try {
      console.log("Attempting login...");
      console.log("API URL:", getFullUrl(API_ENDPOINTS.LOGIN));
      
      const response = await fetch(getFullUrl(API_ENDPOINTS.LOGIN), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          password: password,
        }),
      });

      const responseClone = response.clone();
      
      try {
        const data = await response.json();
        console.log("SUNUCUDAN GELEN YANIT:", JSON.stringify(data, null, 2));

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
          
          console.log("İŞLENEN KULLANICI NESNESİ:", JSON.stringify(user, null, 2));
  
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
              
              console.log(`--- AsyncStorage'a KAYDETME BAŞARILI ---`);
              
              
              router.replace("/");
  
            } catch (storageError) {
              console.error("!!! AsyncStorage'a KAYDEDERKEN HATA OLDU:", storageError);
              Alert.alert("Kritik Hata", "Oturum bilgileri telefona kaydedilemedi. Geliştiriciye bildirin.");
            }
          } else {
            console.error("HATA: Kullanıcı nesnesi sunucu yanıtından alınamadı!");
            Alert.alert("Hata", "Giriş başarılı fakat kullanıcı verisi işlenemedi.");
          }
        } else {
          if (data.blocked) {
            Alert.alert("Hesap Engellendi", data.message || "Hesabınız engellenmiştir. Lütfen yöneticiyle iletişime geçin.");
          } else {
            Alert.alert("Hata", data.message || "Giriş başarısız");
          }
        }
      } catch (jsonError) {
        console.error("!!! JSON parse hatası:", "Sunucu yanıtı JSON formatında değil gibi görünüyor.");
        const rawResponse = await responseClone.text();
        console.error("--- RAW SUNUCU YANITI ---");
        console.error(rawResponse);
        console.error("--- RAW SUNUCU YANITI SONU ---");
        Alert.alert("Teknik Hata", "Sunucudan beklenmedik bir yanıt alındı. Geliştirici konsolu kontrol etmeli.");
      }
    } catch (error) {
      console.error("!!! Genel giriş hatası:", error);
      Alert.alert("Hata", "Sunucu bağlantı hatası. İnternet bağlantınızı kontrol edin.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    Alert.prompt(
      "Şifremi Unuttum", 
      "Şifre sıfırlama e-postası almak için e-posta adresinizi girin:",
      [
        {
          text: "İptal",
          style: "cancel"
        },
        {
          text: "Gönder",
          onPress: async (emailInput) => {
            if (!emailInput) {
              Alert.alert("Hata", "Lütfen e-posta adresinizi girin");
              return;
            }

            // E-posta formatını kontrol et
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(emailInput)) {
              Alert.alert("Hata", "Lütfen geçerli bir e-posta adresi girin");
              return;
            }

            try {
              setLoading(true);
              const response = await fetch(getFullUrl(API_ENDPOINTS.FORGOT_PASSWORD), {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  email: emailInput,
                }),
              });

              const data = await response.json();

              if (response.ok && data.success) {
                Alert.alert(
                  "Başarılı",
                  "Şifre sıfırlama e-postası gönderildi. Lütfen e-posta kutunuzu kontrol edin.",
                  [{ text: "Tamam" }]
                );
              } else {
                Alert.alert("Hata", data.message || "E-posta gönderilemedi");
              }
            } catch (error) {
              console.error('Şifre sıfırlama hatası:', error);
              Alert.alert("Hata", "Sunucu bağlantı hatası. Lütfen tekrar deneyin.");
            } finally {
              setLoading(false);
            }
          }
        }
      ],
      "plain-text",
      "",
      "email-address"
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.gradient}
      >
        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.content}>
          {/* Logo/Header Section */}
          <View style={styles.headerSection}>
            <View style={styles.logoContainer}>
              <Text style={styles.logoText}>🚀</Text>
            </View>
            <Text style={styles.title}>Hoş Geldiniz</Text>
            <Text style={styles.subtitle}>Hesabınıza giriş yapın</Text>
          </View>
          
          {/* Form Section */}
          <View style={styles.formContainer}>
            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>📧 E-posta veya Telefon</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="ornek@email.com veya 555 123 4567"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="default"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              
              <View style={styles.inputContainer}>
                <Text style={styles.label}>🔒 Şifre</Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Şifrenizi girin"
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
              </View>

              {/* Forgot Password Link */}
              <TouchableOpacity 
                style={styles.forgotPasswordContainer}
                onPress={handleForgotPassword}
              >
                <Text style={styles.forgotPasswordText}>Şifremi Unuttum</Text>
              </TouchableOpacity>
              
              {/* Login Button */}
              <TouchableOpacity 
                style={[styles.loginButton, loading && styles.buttonDisabled]} 
                onPress={handleLogin}
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
                      <Text style={styles.buttonText}>Giriş Yap</Text>
                      <Text style={styles.buttonIcon}>→</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {/* Courier Register Button */}
              <TouchableOpacity 
                style={styles.registerButton}
                onPress={() => router.push('/(auth)/courier-register')}
              >
                <LinearGradient
                  colors={['#F59E0B', '#D97706']}
                  style={styles.buttonGradient}
                >
                  <Text style={styles.buttonText}>🚴‍♂️ Kurye Olarak Kayıt Ol</Text>
                  <Text style={styles.buttonIcon}>→</Text>
                </LinearGradient>
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
    paddingTop: height * 0.05,
    paddingBottom: 20,
  },
  logoContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  logoText: {
    fontSize: 28,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
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
    fontSize: 16,
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
  forgotPasswordContainer: {
    alignItems: 'flex-end',
    marginBottom: 24,
  },
  forgotPasswordText: {
    color: '#6366F1',
    fontSize: 14,
    fontWeight: '600',
  },
  loginButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  registerButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    marginTop: 16,
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
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 8,
  },
  buttonIcon: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },

});

export default SignIn;
