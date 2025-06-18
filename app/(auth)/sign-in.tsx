import { useSignIn, useUser, useAuth } from "@clerk/clerk-expo";
import { Link, router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, ImageBackground, ActivityIndicator, Text, View } from "react-native";
import CustomButton from "@/components/CustomButton";
import InputField from "@/components/InputField";
import OAuth from "@/components/OAuth";
import { icons, images } from "@/constants";

const SignIn = () => {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { user } = useUser();
  const { isSignedIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  // Oturum açıldıysa anında ana sayfaya yönlendir
  useEffect(() => {
    if (isSignedIn && user) {
      router.replace("/");
    }
  }, [isSignedIn, user]);

  const onSignInPress = useCallback(async () => {
    if (!isLoaded) {
      Alert.alert("Error", "Clerk henüz yüklenmedi. Lütfen tekrar deneyin.");
      return;
    }
    if (isLoading) return;

    setIsLoading(true);
    try {
      const signInAttempt = await signIn.create({
        identifier: form.email,
        password: form.password,
      });
      if (signInAttempt.status === "complete") {
        await setActive({ session: signInAttempt.createdSessionId });
        router.replace("/");
      } else {
        Alert.alert("Error", "Giriş işlemi başarısız oldu. Lütfen tekrar deneyin.");
      }
    } catch (err: any) {
      console.log(JSON.stringify(err, null, 2));
      Alert.alert("Error", err.errors[0].longMessage);
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded, isLoading, form, signIn, setActive]);

  return (
    <ImageBackground source={images.signUpCar} style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 20 }}>
        <Text style={{ fontSize: 36, fontWeight: "bold", color: "#fff", textAlign: "center", marginBottom: 30 }}>
          Welcome 👋
        </Text>
        <InputField
          label="Email"
          placeholder="Enter email"
          icon={icons.email}
          textContentType="emailAddress"
          value={form.email}
          onChangeText={(value) => setForm({ ...form, email: value })}
          style={{ backgroundColor: "#fff", marginBottom: 12, borderRadius: 8 }}
        />
        <InputField
          label="Password"
          placeholder="Enter password"
          icon={icons.lock}
          secureTextEntry
          textContentType="password"
          value={form.password}
          onChangeText={(value) => setForm({ ...form, password: value })}
          style={{ backgroundColor: "#fff", marginBottom: 20, borderRadius: 8 }}
        />
        <CustomButton
          title={isLoading ? "Signing In..." : "Sign In"}
          onPress={onSignInPress}
          style={{ marginBottom: 20 }}
          disabled={isLoading}
        />
        {isLoading && <ActivityIndicator size="small" color="#fff" style={{ marginBottom: 20 }} />}
        <OAuth />
        <Text style={{ color: "#fff", textAlign: "center", marginTop: 20 }}>
          Don't have an account?{" "}
          <Link href="/sign-up" style={{ color: "#FFD700", fontWeight: "bold" }}>
            Sign Up
          </Link>
        </Text>
      </View>
    </ImageBackground>
  );
};

export default SignIn;
