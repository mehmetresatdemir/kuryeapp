
import { Image, ScrollView, Text, View, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import InputField from "@/components/InputField";
import { useEffect, useState } from "react";
import { router } from 'expo-router';
import { useUser, useAuth } from "@clerk/clerk-expo";
const Profile = () => {
  const { user, isLoaded } = useUser();
  const { signOut } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [userData, setUserData] = useState({ name: "", email: "", role: ""  });

  // Kullanıcı bilgilerini backend'den çekme
  useEffect(() => {
    if (isLoaded && user) {
      const fetchUserData = async () => {
        try {
          const response = await fetch(
            `https://red.enucuzal.com/api/user/${user.id}`
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          

          setUserData({
            name: data.data.name,
            email: data.data.email,
            role: data.data.role,
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

  // State güncellemesini kontrol et
  useEffect(() => {
    
  }, [userData]);

  const handleLogout = async () => {
      try {
        await signOut();
        Alert.alert('Logged out', 'You have been successfully logged out.');
        router.replace('/(auth)/sign-in'); // Redirect to sign-in page
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
      <ScrollView
        className="px-5"
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <Text className="text-2xl font-JakartaBold my-5">My Profile</Text>

        {/* Profile Picture */}
        <View className="flex items-center justify-center my-5">
          <Image
            source={{
              uri: user?.externalAccounts[0]?.imageUrl ?? user?.imageUrl,
            }}
            style={{ width: 110, height: 110, borderRadius: 110 / 2 }}
            className="rounded-full h-[110px] w-[110px] border-[3px] border-white shadow-sm shadow-neutral-300"
          />
        </View>

        {/* User Details */}
        <View className="flex flex-col items-start justify-center bg-white rounded-lg shadow-sm shadow-neutral-300 px-5 py-3">
          <View className="flex flex-col items-start justify-start w-full">
            <InputField
              label="Name"
              value={userData.name}
              placeholder="Not Found"
              containerStyle="w-full bg-gray-200"
              inputStyle="p-3.5 text-black"
              editable={false}
            />

            <InputField
              label="Email"
              value={userData.email}
              placeholder="Not Found"
              containerStyle="w-full bg-gray-200"
              inputStyle="p-3.5 text-black"
              editable={false}
              
            />
            <InputField
              label="Role"
              value={userData.role}
              placeholder="Not Found"
              containerStyle="w-full bg-gray-200"
              inputStyle="p-3.5 text-black"
              editable={false}
            />
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          onPress={handleLogout}
          className="mt-6 bg-red-500 rounded-full py-3 px-6 items-center justify-center"
        >
          <Text className="text-white font-JakartaSemiBold text-lg">
            Logout
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

export default Profile;