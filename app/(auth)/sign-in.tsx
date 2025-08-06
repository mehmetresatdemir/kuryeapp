import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, StatusBar } from "react-native";
import { router } from "expo-router";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS, getFullUrl } from "../../constants/api";
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';

import { 
  Envelope, 
  Eye, 
  EyeSlash, 
  Lock, 
  SignIn as SignInIcon, 
  Bicycle, 
  Storefront, 
  CaretRight
} from "phosphor-react-native";

const SignIn = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedInput, setFocusedInput] = useState<'email' | 'password' | null>(null);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Hata", "Lütfen e-posta ve şifre girin");
      return;
    }

    setLoading(true);
    try {
      console.log("🚀 Attempting login...");
      console.log("📧 Email:", email);
      console.log("🔑 Password length:", password.length);
      console.log("🌐 API URL:", getFullUrl(API_ENDPOINTS.LOGIN));
      console.log("📱 Platform:", Platform.OS);
      
      const requestData = {
        email: email,
        password: password,
      };
      console.log("📤 Request data:", JSON.stringify(requestData));
      
      const response = await fetch(getFullUrl(API_ENDPOINTS.LOGIN), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });
      
      console.log("📥 Response status:", response.status);
      console.log("📥 Response ok:", response.ok);

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
              await AsyncStorage.setItem('userType', user.role || 'unknown'); // ForegroundHandler için
              if (userToken) {
                await AsyncStorage.setItem('userToken', userToken);
              }
              
              console.log(`--- AsyncStorage'a KAYDETME BAŞARILI ---`);
              
              // Bildirim sistemi kaldırıldı
              
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
      } catch {
        console.error("!!! JSON parse hatası:", "Sunucu yanıtı JSON formatında değil gibi görünüyor.");
        const rawResponse = await responseClone.text();
        console.error("--- RAW SUNUCU YANITI ---");
        console.error(rawResponse);
        console.error("--- RAW SUNUCU YANITI SONU ---");
        Alert.alert("Teknik Hata", "Sunucudan beklenmedik bir yanıt alındı. Geliştirici konsolu kontrol etmeli.");
      }
    } catch (error) {
      console.error("!!! Genel giriş hatası:", error);
      console.error("Error type:", typeof error);
      console.error("Error name:", error?.name);
      console.error("Error message:", error?.message);
      console.error("Error stack:", error?.stack);
      
      // Network specific errors
      if (error?.message?.includes('Network')) {
        Alert.alert("Ağ Hatası", "İnternet bağlantınızı kontrol edin ve tekrar deneyin.");
      } else if (error?.message?.includes('fetch')) {
        Alert.alert("Sunucu Hatası", "Sunucuya ulaşılamıyor. Lütfen daha sonra tekrar deneyin.");
      } else {
        Alert.alert("Hata", "Bilinmeyen bir hata oluştu. İnternet bağlantınızı kontrol edin.");
      }
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
              <Text style={styles.title}>KuryeX</Text>
              
            </View>
            
            {/* Main Form Container */}
            <View style={styles.formContainer}>
              <View style={styles.form}>
                {/* Email Input */}
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>E-posta Adresi</Text>
                  <View style={[
                    styles.inputWrapper,
                    focusedInput === 'email' && styles.inputWrapperFocused
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
                  </View>
                </View>
                
                {/* Password Input */}
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Şifre</Text>
                  <View style={[
                    styles.inputWrapper,
                    focusedInput === 'password' && styles.inputWrapperFocused
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
                      placeholder="Şifrenizi girin"
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
                  </View>
                </View>

                {/* Forgot Password */}
                <TouchableOpacity 
                  style={styles.forgotPasswordContainer}
                  onPress={handleForgotPassword}
                >
                  <Text style={styles.forgotPasswordText}>Şifremi Unuttum?</Text>
                </TouchableOpacity>
                
                {/* Sign In Button */}
                <TouchableOpacity 
                  style={[styles.signInButton, loading && styles.buttonDisabled]} 
                  onPress={handleLogin}
                  disabled={loading}
                >
                  <LinearGradient
                    colors={loading ? ['#6B7280', '#4B5563'] : ['#3B82F6', '#1D4ED8']}
                    style={styles.buttonGradient}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <SignInIcon size={20} color="#fff" weight="bold" />
                        <Text style={styles.buttonText}>Giriş Yap</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                {/* Divider */}
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>veya</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* Register Buttons */}
                <View style={styles.registerSection}>
                  <Text style={styles.registerTitle}>Hesabınız yok mu?</Text>
                  
                  <TouchableOpacity 
                    style={styles.registerButton}
                    onPress={() => router.push('/(auth)/courier-register')}
                  >
                    <View style={styles.registerButtonContent}>
                      <View style={styles.registerIconContainer}>
                        <Bicycle size={24} color="#F59E0B" weight="duotone" />
                      </View>
                      <View style={styles.registerTextContainer}>
                        <Text style={styles.registerButtonTitle}>Kurye Olarak Kayıt Ol</Text>
                        <Text style={styles.registerButtonSubtitle}>Sipariş taşıyarak kazanç elde edin</Text>
                      </View>
                      <CaretRight size={20} color="#6B7280" />
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.registerButton}
                    onPress={() => router.push('/(auth)/restaurant-register')}
                  >
                    <View style={styles.registerButtonContent}>
                      <View style={styles.registerIconContainer}>
                        <Storefront size={24} color="#10B981" weight="duotone" />
                      </View>
                      <View style={styles.registerTextContainer}>
                        <Text style={styles.registerButtonTitle}>Restoran Olarak Kayıt Ol</Text>
                        <Text style={styles.registerButtonSubtitle}>İşinizi büyütün, daha fazla müşteriye ulaşın</Text>
                      </View>
                      <CaretRight size={20} color="#6B7280" />
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.versionText}>
                Kurye X v{Constants.expoConfig?.version || '1.0.0'}
              </Text>
              <Text style={styles.footerText}>
                Güvenli ve hızlı teslimat platformu
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 40,
  },

  title: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#94A3B8',
    textAlign: 'center',
    fontWeight: '500',
  },
  formContainer: {
    flex: 1,
    justifyContent: 'center',
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
    marginBottom: 24,
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
  },
  forgotPasswordContainer: {
    alignItems: 'flex-end',
    marginBottom: 32,
  },
  forgotPasswordText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
  signInButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
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
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '500',
    marginHorizontal: 16,
  },
  registerSection: {
    marginTop: 8,
  },
  registerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
    marginBottom: 16,
  },
  registerButton: {
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  registerButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  registerIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  registerTextContainer: {
    flex: 1,
  },
  registerButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  registerButtonSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  footer: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 16,
  },
  versionText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  footerText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
});

export default SignIn;
