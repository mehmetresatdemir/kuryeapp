import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // **Tüm sayfalarda üst başlığı gizler**
      }}
    >
      <Stack.Screen name="(driver)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
