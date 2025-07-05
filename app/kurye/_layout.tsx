import { Tabs } from "expo-router";
import React from "react";
import { Ionicons } from "@expo/vector-icons";

export default function KuryeLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#3B82F6",
        tabBarInactiveTintColor: "#6B7280",
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopWidth: 1,
          borderTopColor: "#E5E7EB",
          paddingBottom: 8,
          paddingTop: 8,
          height: 75,
        },
      }}
    >
      <Tabs.Screen
        name="kuryehome"
        options={{
          title: "Ana Sayfa",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size + 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="kuryeorders"
        options={{
          title: "Aktif Siparişler",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bicycle" size={size + 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="kuryeearnings"
        options={{
          title: "Kazançlar",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cash" size={size + 2} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="kuryeprofile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size + 2} color={color} />
          ),
        }}
      />
    </Tabs>
  );
} 