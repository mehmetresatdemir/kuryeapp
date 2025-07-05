import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";
import AsyncStorage from '@react-native-async-storage/async-storage';

const Page = () => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUserStatus();
  }, []);

  const checkUserStatus = async () => {
    try {
      const userData = await AsyncStorage.getItem('userData');
      
      if (!userData) {
        // Kullanıcı giriş yapmamış, giriş sayfasına yönlendir
        router.replace("/(auth)/sign-in");
        return;
      }

      const user = JSON.parse(userData);
      const userRole = user.role;

      // Kullanıcının rolüne göre uygun sayfaya yönlendir
      switch (userRole) {
        case 'admin':
        case 'firm':
        case 'restaurant':
          router.replace("/restaurant/restauranthome");
          break;
        case 'courier':
          router.replace("/kurye/kuryehome");
          break;
        default:
          // Bilinmeyen rol, giriş sayfasına yönlendir
          router.replace("/(auth)/sign-in");
          break;
      }
    } catch (error) {
      console.error('Error checking user status:', error);
      router.replace("/(auth)/sign-in");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#6366F1" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
});

export default Page;
