import { useSignUp } from "@clerk/clerk-expo";
import { Link, router } from "expo-router";
import { useState } from "react";
import { Alert, Image, ScrollView, Text, View } from "react-native";
import { ReactNativeModal } from "react-native-modal";

import CustomButton from "@/components/CustomButton";
import InputField from "@/components/InputField";
import OAuth from "@/components/OAuth";
import { icons, images } from "@/constants";
import { fetchAPI } from "@/lib/fetch";
import { TouchableOpacity } from "react-native";

const SignUp = () => {
  const { isLoaded, signUp, setActive } = useSignUp();
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "user", // Varsayılan rol olarak "user" ekledik
  });

  const [verification, setVerification] = useState({
    state: "default",
    error: "",
    code: "",
  });

  const onSignUpPress = async () => {
    if (!isLoaded) return;
    try {
      // Kullanıcı oluştur
      await signUp.create({
        emailAddress: form.email,
        password: form.password,
      });

      // E-posta doğrulaması hazırla
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });

      setVerification({
        ...verification,
        state: "pending",
      });
    } catch (err: any) {
      console.log("SignUp Error:", JSON.stringify(err, null, 2));
      Alert.alert("Error", err.errors[0].longMessage);
    }
  };

  const onPressVerify = async () => {
    if (!isLoaded) return;
    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code: verification.code,
      });

      if (completeSignUp.status === "complete") {
        // Kullanıcıyı kendi veritabanınıza kaydedin
        try {
          const response = await fetch("https://red.enucuzal.com/api/user", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: form.name,
              email: form.email,
              clerkId: completeSignUp.createdUserId,
              role: form.role, // Rol bilgisini de gönderiyoruz
            }),
          });

          if (!response.ok) {
            throw new Error("Failed to save user data");
          }

          console.log("User saved successfully:", response);

          // Clerk oturumunu aktif hale getir
          await setActive({ session: completeSignUp.createdSessionId });

        // Rolüne göre yönlendirme yap
        if (form.role === "user") {
          router.replace("/(root)/(tabs)/home"); // Kullanıcı için ana sayfaya yönlendir
        } else if (form.role === "driver") {
          router.replace("/(driver)/(tabs)/driver-home"); // Sürücü için sürücü ana sayfasına yönlendir
        }
      } catch (err: any) {
        console.error("Database Error:", JSON.stringify(err, null, 2));
        Alert.alert("Error", "Failed to save user data. Please try again.");
        return;
      }
    } else {
      setVerification({
        ...verification,
        error: "Verification failed. Please try again.",
        state: "failed",
      });
    }
  } catch (err: any) {
    console.error("Verification Error:", JSON.stringify(err, null, 2));
    setVerification({
      ...verification,
      error: err.errors[0].longMessage,
      state: "failed",
    });
  }
};

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "white" }}>
      <View style={{ flex: 1, backgroundColor: "white" }}>
        <View style={{ position: "relative", width: "100%", height: 250 }}>
          <Image source={images.signUpCar} className="z-0 w-full h-[250px]" />

          <Text
            style={{
              fontSize: 24,
              color: "black",
              fontWeight: "600",
              position: "absolute",
              bottom: 20,
              left: 20,
            }}
          >
            Create Your Account
          </Text>
        </View>
        <View style={{ padding: 20 }}>
          <InputField
            label="Name"
            placeholder="Enter name"
            icon={icons.person}
            value={form.name}
            onChangeText={(value) => setForm({ ...form, name: value })}
          />
          <InputField
            label="Email"
            placeholder="Enter email"
            icon={icons.email}
            textContentType="emailAddress"
            value={form.email}
            onChangeText={(value) => setForm({ ...form, email: value })}
          />
          <InputField
            label="Password"
            placeholder="Enter password"
            icon={icons.lock}
            secureTextEntry={true}
            textContentType="password"
            value={form.password}
            onChangeText={(value) => setForm({ ...form, password: value })}
          />

          {/* Rol Seçimi */}
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 16, marginBottom: 8, color: "#333" }}>
              Select Role:
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: form.role === "user" ? "#6a11cb" : "#f5f5f5",
                  alignItems: "center",
                }}
                onPress={() => setForm({ ...form, role: "user" })}
              >
                <Text
                  style={{
                    color: form.role === "user" ? "#fff" : "#333",
                    fontWeight: "500",
                  }}
                >
                  User
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: form.role === "driver" ? "#6a11cb" : "#f5f5f5",
                  alignItems: "center",
                }}
                onPress={() => setForm({ ...form, role: "driver" })}
              >
                <Text
                  style={{
                    color: form.role === "driver" ? "#fff" : "#333",
                    fontWeight: "500",
                  }}
                >
                  Driver
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <CustomButton
            title="Sign Up"
            onPress={onSignUpPress}
            style={{ marginTop: 24 }}
          />
          <OAuth />
          <Link
            href="/sign-in"
            style={{ fontSize: 18, textAlign: "center", color: "#666", marginTop: 40 }}
          >
            Already have an account?{" "}
            <Text style={{ color: "#007bff" }}>Log In</Text>
          </Link>
        </View>
        <ReactNativeModal
          isVisible={verification.state === "pending"}
          onModalHide={() => {
            if (verification.state === "success") {
              setShowSuccessModal(true);
            }
          }}
        >
          <View
            style={{
              backgroundColor: "white",
              paddingHorizontal: 28,
              paddingVertical: 36,
              borderRadius: 16,
              minHeight: 300,
            }}
          >
            <Text style={{ fontSize: 24, fontWeight: "bold", marginBottom: 8 }}>
              Verification
            </Text>
            <Text style={{ marginBottom: 20 }}>
              We've sent a verification code to {form.email}.
            </Text>
            <InputField
              label={"Code"}
              icon={icons.lock}
              placeholder={"12345"}
              value={verification.code}
              keyboardType="numeric"
              onChangeText={(code) => setVerification({ ...verification, code })}
            />
            {verification.error && (
              <Text style={{ color: "red", fontSize: 14, marginTop: 4 }}>
                {verification.error}
              </Text>
            )}
            <CustomButton
              title="Verify Email"
              onPress={onPressVerify}
              style={{ marginTop: 20, backgroundColor: "#28a745" }}
            />
          </View>
        </ReactNativeModal>
        <ReactNativeModal isVisible={showSuccessModal}>
          <View className="bg-white px-7 py-9 rounded-2xl min-h-[300px]">
            <Image
              source={images.check}
              className="w-[110px] h-[110px] mx-auto my-5"
            />
            <Text className="text-3xl font-JakartaBold text-center">Verified</Text>
            <Text className="text-base text-gray-400 font-Jakarta text-center mt-2">
              You have successfully verified your account.
            </Text>
            <CustomButton
              title="Browse Home"
              onPress={() => router.push(`/(root)/(tabs)/home`)}
              className="mt-5"
            />
          </View>
        </ReactNativeModal>
      </View>
    </ScrollView>
  );
};

export default SignUp;