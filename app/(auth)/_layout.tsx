import { Stack } from "expo-router";

const Layout = () => {
  return (
    <Stack>
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="courier-register" options={{ headerShown: false }} />
      <Stack.Screen name="restaurant-register" options={{ headerShown: false }} />
    </Stack>
  );
};

export default Layout;