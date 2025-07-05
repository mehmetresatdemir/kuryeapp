import { Tabs } from "expo-router";
import React from "react";
import { Ionicons } from "@expo/vector-icons";

export default function RestaurantLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#059669",
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
        name="restauranthome"
        options={{
          title: "Ana Sayfa",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size + 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="restaurantorders"
        options={{
          title: "Siparişler",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list" size={size + 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="restaurantlivemap"
        options={{
          title: "Canlı Harita",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map" size={size + 2} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="restaurantprofile"
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