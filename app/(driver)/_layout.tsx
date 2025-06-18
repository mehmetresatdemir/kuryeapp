import { Stack } from "expo-router";

export default function DriverLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      
    </Stack>
  );
}
