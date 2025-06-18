import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons"; // İkonlar için
import { StyleSheet } from "react-native";

export default function DriverTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#FFFFFF", // Aktif sekme metin ve ikon rengi (beyaz)
        tabBarInactiveTintColor: "#D1D5DB", // Pasif sekme metin ve ikon rengi (gri)
        tabBarStyle: styles.tabBar, // Tab bar stilini özelleştirin
        headerShown: true, // Başlık çubuğunu gösterin
        headerStyle: styles.header, // Üst menü stilini özelleştirin
        headerTintColor: "#FFFFFF", // Üst menü metin rengi (beyaz)
        headerTitleStyle: styles.headerTitle, // Üst menü başlık stilini özelleştirin
      }}
    >
      {/* Home Sekmesi */}
      <Tabs.Screen
        name="driver-home" // Sayfa adı
        options={{
          tabBarLabel: "Home", // Sekme etiketi
          tabBarIcon: ({ color }) => (
            <Ionicons name="home" size={24} color={color} /> // Sekme ikonu
          ),
          title: "Driver Home", // Üst menü başlığı
        }}
      />
      {/* Orders Sekmesi */}
      <Tabs.Screen
        name="Liveorders"
        options={{
          tabBarLabel: "Live Orders", // Sekme etiketi
          tabBarIcon: ({ color }) => (
            <Ionicons name="list" size={24} color={color} /> // Sekme ikonu
          ),
          title: "Driver Orders", // Üst menü başlığı
        }}
      />
      {/* kazanc Sekmesi */}
      <Tabs.Screen
        name="earnings"
        options={{
          tabBarLabel: "Earnings", // Sekme etiketi
          tabBarIcon: ({ color }) => (
            <Ionicons name="cash" size={24} color={color} /> // Sekme ikonu
          ),
          title: "Earnings", // Üst menü başlığı
        }}
      />
      {/* Profile Sekmesi */}
      <Tabs.Screen
        name="Driver-profile"
        options={{
          tabBarLabel: "Profile", // Sekme etiketi
          tabBarIcon: ({ color }) => (
            <Ionicons name="person" size={24} color={color} /> // Sekme ikonu
          ),
          title: "Driver Profile", // Üst menü başlığı
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "#6a11cb", // Tab bar arka plan rengi (mor)
    borderTopWidth: 0, // Üst kenarlığı kaldırın
    elevation: 10, // Gölge efekti (Android)
    shadowColor: "#000", // Gölge rengi (iOS)
    shadowOffset: { width: 0, height: -2 }, // Gölge konumu (iOS)
    shadowOpacity: 0.1, // Gölge opaklığı (iOS)
    shadowRadius: 5, // Gölge yarıçapı (iOS)
  },
  header: {
    backgroundColor: "#6a11cb", // Üst menü arka plan rengi (mor)
    elevation: 10, // Gölge efekti (Android)
    shadowColor: "#000", // Gölge rengi (iOS)
    shadowOffset: { width: 0, height: 2 }, // Gölge konumu (iOS)
    shadowOpacity: 0.1, // Gölge opaklığı (iOS)
    shadowRadius: 5, // Gölge yarıçapı (iOS)
  },
  headerTitle: {
    fontWeight: "bold", // Başlık metni kalın
    fontSize: 20, // Başlık metni boyutu
  },
});