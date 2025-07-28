import { Tabs } from "expo-router";
import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

// Animated Tab Bar Icon Component
const AnimatedTabIcon = ({ name, color, size, focused }: { name: any, color: string, size: number, focused: boolean }) => {
  const scale = useSharedValue(1);

  React.useEffect(() => {
    scale.value = withSpring(focused ? 1.1 : 1, {
      damping: 15,
      stiffness: 150
    });
  }, [focused, scale]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }]
    };
  });

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: 32 }}>
      <Animated.View style={animatedStyle}>
        {focused ? (
          <View style={{
            padding: 8,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 40,
            minHeight: 40,
            backgroundColor: '#3B82F6',
          }}>
            <Ionicons name={name} size={size} color="#FFFFFF" />
          </View>
        ) : (
          <View style={{
            padding: 8,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 40,
            minHeight: 40,
          }}>
            <Ionicons name={name} size={size} color={color} />
          </View>
        )}
      </Animated.View>
    </View>
  );
};

export default function KuryeLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#3B82F6",
        tabBarInactiveTintColor: "#9CA3AF",
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopWidth: 0,
          paddingBottom: 12,
          paddingTop: 12,
          height: 90,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.1,
          shadowRadius: 6,
          elevation: 10,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
          marginTop: 8,
        },
        tabBarItemStyle: {
          paddingVertical: 6,
        },
      }}
    >
      <Tabs.Screen
        name="kuryehome"
        options={{
          title: "Ana Sayfa",
          tabBarIcon: ({ color, size, focused }) => (
            <AnimatedTabIcon 
              name="home" 
              color={color} 
              size={size} 
              focused={focused} 
            />
          ),
        }}
      />
      <Tabs.Screen
        name="kuryeorders"
        options={{
          title: "Aktif Siparişler",
          tabBarIcon: ({ color, size, focused }) => (
            <AnimatedTabIcon 
              name="bicycle" 
              color={color} 
              size={size} 
              focused={focused} 
            />
          ),
        }}
      />
      <Tabs.Screen
        name="kuryeearnings"
        options={{
          title: "Kazançlar",
          tabBarIcon: ({ color, size, focused }) => (
            <AnimatedTabIcon 
              name="cash" 
              color={color} 
              size={size} 
              focused={focused} 
            />
          ),
        }}
      />

      <Tabs.Screen
        name="kuryeprofile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, size, focused }) => (
            <AnimatedTabIcon 
              name="person" 
              color={color} 
              size={size} 
              focused={focused} 
            />
          ),
        }}
      />
    </Tabs>
  );
} 