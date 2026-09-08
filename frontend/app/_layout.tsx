import '@/global.css';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { db } from '@/db/client';
import migrations from '@/drizzle/migrations';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);

  useEffect(() => {
    if (success || error) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [success, error]);

  if (error) {
    return (
      <View className="flex-1 items-center justify-center gap-2 bg-ink-50 p-6">
        <Text className="text-lg font-semibold text-danger-500">Could not open the local database</Text>
        <Text className="text-center text-base text-ink-500">{error.message}</Text>
      </View>
    );
  }

  if (!success) {
    return (
      <View className="flex-1 items-center justify-center bg-ink-50">
        <ActivityIndicator size="large" color="#2C7A3D" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="animal/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="animal/new" options={{ presentation: 'modal', headerShown: true, title: 'New animal' }} />
          <Stack.Screen name="log/index" options={{ presentation: 'modal', headerShown: true, title: 'Log an event' }} />
          <Stack.Screen name="log/breeding" options={{ headerShown: true, title: 'Log breeding event' }} />
          <Stack.Screen name="log/health" options={{ headerShown: true, title: 'Log treatment' }} />
          <Stack.Screen name="log/birth" options={{ headerShown: true, title: 'Log birth' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
