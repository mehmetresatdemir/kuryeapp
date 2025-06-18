import { Image, ScrollView, Text, View, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import InputField from "@/components/InputField";
import { useEffect, useState } from "react";
import { router } from 'expo-router';
import { useUser, useAuth } from "@clerk/clerk-expo";

interface UserData {
  name: string;
  email: string;
  role: string;
  phone_number: string;
  iban: string;
  motor_plate: string;
}

const DriverProfile = () => {
  const { user, isLoaded } = useUser();
  const { signOut } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [userData, setUserData] = useState<UserData>({
    name: "",
    email: "",
    role: "",
    phone_number: "",
    iban: "",
    motor_plate: "",
  });

  // Kullanıcı bilgilerini backend'den çekme
  useEffect(() => {
    if (isLoaded && user) {
      const fetchUserData = async () => {
        try {
          const response = await fetch(`https://red.enucuzal.com/api/user/${user.id}`);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const data = await response.json();
          setUserData({
            name: data.data.name,
            email: data.data.email,
            role: data.data.role,
            phone_number: data.data.phone_number || "",
            iban: data.data.iban || "",
            motor_plate: data.data.motor_plate || "",
          });
        } catch (error) {
          console.error("Error fetching user data:", error);
        } finally {
          setIsLoading(false);
        }
      };
      fetchUserData();
    }
  }, [isLoaded, user]);

  // Kullanıcı bilgilerini güncelleme işlemi
  const handleUpdateProfile = async () => {
    try {
      const response = await fetch(`https://red.enucuzal.com/api/user/${user!.id}`, {
        method: "PUT", // Veya backend'in kabul ettiği method
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(userData),
      });
      if (!response.ok) {
        throw new Error("Güncelleme sırasında hata oluştu.");
      }
      Alert.alert("Başarılı", "Profil başarıyla güncellendi.");
    } catch (error) {
      console.error("Error updating profile:", error);
      Alert.alert("Hata", "Profil güncellenirken bir hata oluştu.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      Alert.alert('Logged out', 'You have been successfully logged out.');
      router.replace('/(auth)/sign-in');
    } catch (error) {
      console.error('Logout failed:', error);
      Alert.alert('Error', 'Failed to log out. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-neutral-100 items-center justify-center">
        <ActivityIndicator size="large" color="#0000ff" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-neutral-100">
      <ScrollView className="px-5" contentContainerStyle={{ paddingBottom: 40 }}>
        <Text className="text-2xl font-bold my-5 text-center">Driver Profile</Text>

        {/* Profile Picture */}
        <View className="flex items-center justify-center my-5">
          <Image
            source={{ uri: user?.externalAccounts[0]?.imageUrl ?? user?.imageUrl }}
            style={{ width: 110, height: 110, borderRadius: 55 }}
            className="rounded-full h-[110px] w-[110px] border-[3px] border-white shadow-sm shadow-neutral-300"
          />
        </View>

        {/* User Details */}
        <View className="bg-white rounded-lg shadow-sm shadow-neutral-300 px-5 py-3">
          <InputField
            label="Name"
            value={userData.name}
            placeholder="Name"
            containerStyle="w-full bg-gray-200"
            inputStyle="p-3.5 text-black"
            onChangeText={(text) => setUserData({ ...userData, name: text })}
          />
          <InputField
            label="Email"
            value={userData.email}
            placeholder="Email"
            containerStyle="w-full bg-gray-200"
            inputStyle="p-3.5 text-black"
            onChangeText={(text) => setUserData({ ...userData, email: text })}
          />
          <InputField
            label="Role"
            value={userData.role}
            placeholder="Role"
            containerStyle="w-full bg-gray-200"
            inputStyle="p-3.5 text-black"
            onChangeText={(text) => setUserData({ ...userData, role: text })}
          />
          <InputField
            label="Phone Number"
            value={userData.phone_number}
            placeholder="Phone Number"
            containerStyle="w-full bg-gray-200"
            inputStyle="p-3.5 text-black"
            onChangeText={(text) => setUserData({ ...userData, phone_number: text })}
          />
          <InputField
            label="IBAN"
            value={userData.iban}
            placeholder="IBAN"
            containerStyle="w-full bg-gray-200"
            inputStyle="p-3.5 text-black"
            onChangeText={(text) => setUserData({ ...userData, iban: text })}
          />
          <InputField
            label="Motor Plate"
            value={userData.motor_plate}
            placeholder="Motor Plate"
            containerStyle="w-full bg-gray-200"
            inputStyle="p-3.5 text-black"
            onChangeText={(text) => setUserData({ ...userData, motor_plate: text })}
          />
        </View>

        {/* Güncelle Butonu */}
        <TouchableOpacity
          onPress={handleUpdateProfile}
          className="mt-6 bg-green-500 rounded-full py-3 px-6 items-center justify-center"
        >
          <Text className="text-white font-bold text-lg">Güncelle</Text>
        </TouchableOpacity>

        {/* Logout Butonu */}
        <TouchableOpacity
          onPress={handleLogout}
          className="mt-6 bg-red-500 rounded-full py-3 px-6 items-center justify-center"
        >
          <Text className="text-white font-bold text-lg">Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

export default DriverProfile;
