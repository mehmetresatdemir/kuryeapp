import { Tabs } from "expo-router";
import { Image, ImageSourcePropType, View, Platform } from "react-native";
import { icons } from "@/constants";

// Define the type for the icons object
type Icons = {
  home: ImageSourcePropType;
  star: ImageSourcePropType;
  profile: ImageSourcePropType;
};

// TabIcon Component
const TabIcon = ({
  source,
  focused,
}: {
  source: ImageSourcePropType;
  focused: boolean;
}) => (
  <View
    className={`flex flex-row justify-center items-center rounded-full ${focused ? "bg-general-300" : ""}`}
    accessibilityRole="button"
    accessibilityLabel={focused ? "Selected tab" : "Tab"}
  >
    <View
      className={`rounded-full w-12 h-12 items-center justify-center ${focused ? "bg-general-400" : ""}`}
    >
      <Image
        source={source}
        tintColor="white"
        resizeMode="contain"
        className="w-7 h-7"
        accessibilityIgnoresInvertColors // Prevents icon color inversion on iOS
      />
    </View>
  </View>
);

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        tabBarActiveTintColor: "white",
        tabBarInactiveTintColor: "white",
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: "#333333",
          borderRadius: 50,
          paddingBottom: Platform.select({ ios: 20, android: 10 }), // Platform-specific padding
          overflow: "hidden",
          marginHorizontal: 20,
          marginBottom: Platform.select({ ios: 45, android: 20 }), // Platform-specific margin
          height: 78,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexDirection: "row",
          position: "absolute",
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon source={icons.home} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="LiveMap"
        options={{
          title: "CreateOrder",
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon source={icons.map} focused={focused} />
          ),
        }}
      />
       <Tabs.Screen
        name="OrderManagement"
        options={{
          title: "EarningsScreen",
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon source={icons.dollar} focused={focused} />
          ),
        }}
      />  
        
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon source={icons.profile} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}