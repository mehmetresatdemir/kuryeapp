// Sign-up disabled - using custom authentication with pre-created accounts
// import { useSignUp } from "@clerk/clerk-expo";
import { Link, router } from "expo-router";
import { useState } from "react";
import { Alert, ImageBackground, ScrollView, Text, View, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from "react-native";
import { ReactNativeModal } from "react-native-modal";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import CustomButton from "@/components/CustomButton";
import InputField from "@/components/InputField";
import OAuth from "@/components/OAuth";
import { icons, images } from "@/constants";
import { API_CONFIG, getFullUrl, API_ENDPOINTS } from "@/constants/api";
import { fetchAPI } from "@/lib/fetch";

const SignUp = () => {
  // const { isLoaded, signUp, setActive } = useSignUp();
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "user",
  });

  const [verification, setVerification] = useState({
    state: "default",
    error: "",
    code: "",
  });

  const onSignUpPress = async () => {
    // Sign-up disabled for custom authentication
    Alert.alert(
      "Kayıt Devre Dışı", 
      "Şu anda yeni kayıt kabul edilmiyor. Lütfen giriş sayfasından test hesaplarından birini kullanın.",
      [
        { text: "Tamam" },
        { text: "Giriş Sayfası", onPress: () => router.replace("/(auth)/sign-in") }
      ]
    );
  };

  const onPressVerify = async () => {
    // Verification disabled
    Alert.alert("Info", "Verification is currently disabled.");
  };

  return (
    <ImageBackground 
      source={images.signUpCar} 
      style={styles.background}
      resizeMode="cover"
    >
      <LinearGradient
        colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)']}
        style={styles.gradient}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.container}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.headerContainer}>
              <Text style={styles.welcomeText}>Hesap Oluştur</Text>
              <Text style={styles.subText}>Hemen kayıt olun ve başlayın</Text>
            </View>

            <View style={styles.formContainer}>
              <View style={styles.inputContainer}>
                <InputField
                  label="Ad Soyad"
                  placeholder="Adınızı girin"
                  icon="person-outline"
                  value={form.name}
                  onChangeText={(value) => setForm({ ...form, name: value })}
                  style={styles.input}
                />
              </View>

              <View style={styles.inputContainer}>
                <InputField
                  label="E-posta"
                  placeholder="E-posta adresinizi girin"
                  icon="mail-outline"
                  textContentType="emailAddress"
                  value={form.email}
                  onChangeText={(value) => setForm({ ...form, email: value })}
                  style={styles.input}
                />
              </View>

              <View style={styles.inputContainer}>
                <View style={styles.passwordContainer}>
                  <InputField
                    label="Şifre"
                    placeholder="Şifrenizi girin"
                    icon="lock-closed-outline"
                    secureTextEntry={!showPassword}
                    textContentType="password"
                    value={form.password}
                    onChangeText={(value) => setForm({ ...form, password: value })}
                    style={[styles.input, { paddingRight: 45 }]}
                  />
                  <TouchableOpacity 
                    style={styles.eyeIcon}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons 
                      name={showPassword ? "eye-off-outline" : "eye-outline"} 
                      size={20} 
                      color="#6B7280"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.roleContainer}>
                <Text style={styles.roleTitle}>Hesap Türü</Text>
                <View style={styles.roleButtons}>
                  <TouchableOpacity
                    style={[
                      styles.roleButton,
                      form.role === "user" && styles.roleButtonActive
                    ]}
                    onPress={() => setForm({ ...form, role: "user" })}
                  >
                    <Ionicons 
                      name="person" 
                      size={20} 
                      color={form.role === "user" ? "#FFFFFF" : "#6B7280"} 
                    />
                    <Text style={[
                      styles.roleButtonText,
                      form.role === "user" && styles.roleButtonTextActive
                    ]}>Kullanıcı</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.roleButton,
                      form.role === "driver" && styles.roleButtonActive
                    ]}
                    onPress={() => setForm({ ...form, role: "driver" })}
                  >
                    <Ionicons 
                      name="car" 
                      size={20} 
                      color={form.role === "driver" ? "#FFFFFF" : "#6B7280"} 
                    />
                    <Text style={[
                      styles.roleButtonText,
                      form.role === "driver" && styles.roleButtonTextActive
                    ]}>Sürücü</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={styles.signUpButton}
                onPress={onSignUpPress}
              >
                <LinearGradient
                  colors={['#3B82F6', '#2563EB']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.signUpGradient}
                >
                  <Text style={styles.signUpText}>Kayıt Ol</Text>
                </LinearGradient>
              </TouchableOpacity>

              <View style={styles.dividerContainer}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>veya</Text>
                <View style={styles.divider} />
              </View>

              <OAuth />

              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  Zaten hesabınız var mı?{" "}
                  <Link href="/sign-in" style={styles.signInLink}>
                    Giriş Yap
                  </Link>
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>

      <ReactNativeModal
        isVisible={verification.state === "pending"}
        style={styles.modal}
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Doğrulama</Text>
          <Text style={styles.modalText}>
            {form.email} adresine doğrulama kodu gönderdik.
          </Text>
          <InputField
            label="Kod"
            placeholder="Doğrulama kodunu girin"
            icon="key-outline"
            value={verification.code}
            keyboardType="numeric"
            onChangeText={(code) => setVerification({ ...verification, code })}
            style={styles.input}
          />
          {verification.error && (
            <Text style={styles.errorText}>{verification.error}</Text>
          )}
          <TouchableOpacity
            style={styles.verifyButton}
            onPress={onPressVerify}
          >
            <LinearGradient
              colors={['#10B981', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.verifyGradient}
            >
              <Text style={styles.verifyText}>Doğrula</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ReactNativeModal>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 20,
  },
  headerContainer: {
    alignItems: "center",
    marginVertical: 40,
  },
  welcomeText: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  subText: {
    fontSize: 16,
    color: "#E5E7EB",
    opacity: 0.8,
  },
  formContainer: {
    backgroundColor: "rgba(214, 210, 210, 0.95)",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 1,
    borderColor: "rgba(10, 0, 0, 0.1)",
  },
  inputContainer: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    height: 50,
    paddingHorizontal: 16,
    fontSize: 14,
    color: "#1F2937",
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.1)",
  },
  passwordContainer: {
    position: 'relative',
  },
  eyeIcon: {
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: [{ translateY: -10 }],
    zIndex: 1,
  },
  roleContainer: {
    marginBottom: 24,
  },
  roleTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4B5563",
    marginBottom: 8,
  },
  roleButtons: {
    flexDirection: "row",
    gap: 12,
  },
  roleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F3F4F6",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.1)",
  },
  roleButtonActive: {
    backgroundColor: "#3B82F6",
  },
  roleButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
  roleButtonTextActive: {
    color: "#FFFFFF",
  },
  signUpButton: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 24,
  },
  signUpGradient: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  signUpText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  dividerText: {
    color: "#6B7280",
    paddingHorizontal: 16,
    fontSize: 14,
  },
  footer: {
    alignItems: "center",
    marginTop: 1,
  },
  footerText: {
    color: "#4B5563",
    fontSize: 14,
  },
  signInLink: {
    color: "#3B82F6",
    fontWeight: "600",
    padding: 10,
  },
  modal: {
    margin: 0,
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.1)",
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 8,
  },
  modalText: {
    fontSize: 14,
    color: "#4B5563",
    marginBottom: 20,
  },
  errorText: {
    color: "#EF4444",
    fontSize: 14,
    marginTop: 4,
  },
  verifyButton: {
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 20,
  },
  verifyGradient: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  verifyText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default SignUp;