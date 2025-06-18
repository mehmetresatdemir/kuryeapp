import { useAuth, useUser } from "@clerk/clerk-expo";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View, Text, Button, Platform } from "react-native";

const baseURL = "https://red.enucuzal.com";

console.log("Using baseURL:", baseURL);

const Page = () => {
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Kullanıcı rolünü çekmek için fonksiyon
  const fetchUserRole = async () => {
    if (isSignedIn && user) {
      try {
        const response = await fetch(`${baseURL}/api/user/${user.id}`);
        if (response.status === 404) {
          console.warn("User not found in database");
          setError("Kullanıcı veritabanında bulunamadı. Lütfen destek ile iletişime geçin.");
          return null;
        }
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log("API Response:", data);
        if (data.data && data.data.role) {
          return data.data.role;
        } else {
          throw new Error("Role not found in response");
        }
      } catch (err: any) {
        console.error("Error fetching user role:", err);
        setError("Kullanıcı rolü çekilirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.");
        return null;
      }
    }
    return null;
  };

  // Rolü yeniden yüklemek için fonksiyon
  const loadUserRole = async () => {
    setIsLoading(true);
    setError(null);
    const role = await fetchUserRole();
    if (role) {
      setUserRole(role);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadUserRole();
  }, [isSignedIn, user]);

  // Kullanıcı oturum açmamışsa yönlendir
  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  // Yükleme devam ediyorsa spinner göster
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  // Hata varsa hata mesajı ve yenile butonu göster
  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: "red", fontSize: 16, marginBottom: 10 }}>{error}</Text>
        <Button title="Yeniden Deneyin" onPress={loadUserRole} />
      </View>
    );
  }

  // Kullanıcı rolüne göre yönlendirme
  if (userRole === "driver") {
    return <Redirect href="/(driver)/(tabs)/driver-home" />;
  }
  if (userRole === "user") {
    return <Redirect href="/(root)/(tabs)/home" />;
  }

  // Rol bilgisi alınamadıysa kullanıcıya bildir ve yeniden deneme butonu ekle
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text style={{ fontSize: 16, marginBottom: 10 }}>
        Kullanıcı rolü alınamadı. Lütfen destek ile iletişime geçin.
      </Text>
      <Button title="Yeniden Deneyin" onPress={loadUserRole} />
    </View>
  );
};

export default Page;
