import '@/global.css';
import { useCallback, useEffect } from 'react';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack, ThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { db } from '@/db/client';
import { refreshRemindersAndNotifications } from '@/lib/reminderSync';
import { UndoToastHost } from '@/components/ui/UndoToast';
import { LicenseProvider } from '@/components/license/LicenseProvider';
import { WriteRouteGuard } from '@/components/license/WriteRouteGuard';
import { useColors, useIsDark } from '@/theme/colors';
import migrations from '@/drizzle/migrations';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);
  const colors = useColors();
  const isDark = useIsDark();

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const ready = success && fontsLoaded;

  /**
   * Hides the system splash once whatever we render first has actually laid out.
   *
   * Hiding it as soon as JS starts leaves a blank frame between the platform's launch screen and
   * ours. Waiting for a real layout pass means the system splash lifts onto an already-painted
   * screen, so a cold start reads as one continuous green rather than a flicker. Safe to fire more
   * than once; the later calls are no-ops.
   */
  const handleFirstLayout = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (success) {
      refreshRemindersAndNotifications().catch(() => {});
    }
  }, [success]);

  if (error) {
    return (
      <View className="flex-1 items-center justify-center gap-2 bg-canvas p-6" onLayout={handleFirstLayout}>
        <Text className="text-headline font-sans-semibold text-danger">Could not open the local database</Text>
        <Text className="text-center text-callout text-secondary">{error.message}</Text>
      </View>
    );
  }

  // The native splash screen covers font loading and the database migration.
  // When ready is true, GestureHandlerRootView calls handleFirstLayout to lift the splash.
  if (!ready) {
    return null;
  }

  // Navigation chrome (headers, card backgrounds) is themed from the same tokens as the content,
  // so a dark device does not get light headers over dark screens.
  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      primary: colors.brand,
      background: colors.canvas,
      card: colors.surface,
      text: colors.primary,
      border: colors.border,
    },
  };

  return (
    <GestureHandlerRootView className="flex-1" onLayout={handleFirstLayout}>
      <SafeAreaProvider>
        <ThemeProvider value={navTheme}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <LicenseProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                headerTitleStyle: { fontFamily: 'Inter_600SemiBold', color: colors.primary },
                headerShadowVisible: false,
                contentStyle: { backgroundColor: colors.canvas },
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="animal/[id]/index" options={{ headerShown: true, title: '' }} />
              <Stack.Screen
                name="animal/[id]/edit"
                options={{ presentation: 'modal', headerShown: true, title: 'Edit animal' }}
              />
              <Stack.Screen name="animal/new" options={{ presentation: 'modal', headerShown: true, title: 'New animal' }} />
              {/* The log forms replace the chooser inside the same modal, so they declare the same
                  presentation — one `router.back()` then dismisses the whole logging flow. */}
              <Stack.Screen name="log/index" options={{ presentation: 'modal', headerShown: true, title: 'Log an event' }} />
              <Stack.Screen name="log/breeding" options={{ presentation: 'modal', headerShown: true, title: 'Log breeding event' }} />
              <Stack.Screen name="log/health" options={{ presentation: 'modal', headerShown: true, title: 'Log treatment' }} />
              <Stack.Screen name="log/birth" options={{ presentation: 'modal', headerShown: true, title: 'Log birth' }} />
              <Stack.Screen name="log/milk" options={{ presentation: 'modal', headerShown: true, title: 'Record milking' }} />
              <Stack.Screen name="log/eggs" options={{ presentation: 'modal', headerShown: true, title: 'Egg collection' }} />
              <Stack.Screen name="flock/[id]/index" options={{ headerShown: true, title: '' }} />
              <Stack.Screen
                name="flock/[id]/edit"
                options={{ presentation: 'modal', headerShown: true, title: 'Edit flock' }}
              />
              <Stack.Screen
                name="flock/[id]/log"
                options={{ presentation: 'modal', headerShown: true, title: 'Log for flock' }}
              />
              <Stack.Screen name="flock/new" options={{ presentation: 'modal', headerShown: true, title: 'New flock' }} />
              <Stack.Screen name="hatch/[id]/index" options={{ headerShown: true, title: '' }} />
              <Stack.Screen
                name="hatch/[id]/candle"
                options={{ presentation: 'modal', headerShown: true, title: 'Candling' }}
              />
              <Stack.Screen
                name="hatch/[id]/hatch"
                options={{ presentation: 'modal', headerShown: true, title: 'Record hatch' }}
              />
              <Stack.Screen name="hatch/new" options={{ presentation: 'modal', headerShown: true, title: 'Set eggs' }} />
              <Stack.Screen name="customers/index" options={{ headerShown: true, title: 'Customers' }} />
              <Stack.Screen name="customers/[id]/index" options={{ headerShown: true, title: '' }} />
              <Stack.Screen
                name="customers/[id]/deliver"
                options={{ presentation: 'modal', headerShown: true, title: 'Record delivery' }}
              />
              <Stack.Screen
                name="customers/[id]/pay"
                options={{ presentation: 'modal', headerShown: true, title: 'Record payment' }}
              />
              <Stack.Screen
                name="customers/new"
                options={{ presentation: 'modal', headerShown: true, title: 'New customer' }}
              />
              <Stack.Screen name="suppliers/index" options={{ headerShown: true, title: 'Who I owe' }} />
              <Stack.Screen name="suppliers/[id]/index" options={{ headerShown: true, title: '' }} />
              <Stack.Screen
                name="suppliers/[id]/pay"
                options={{ presentation: 'modal', headerShown: true, title: 'Record payment' }}
              />
              <Stack.Screen
                name="suppliers/new"
                options={{ presentation: 'modal', headerShown: true, title: 'New supplier' }}
              />
              <Stack.Screen name="money/new" options={{ presentation: 'modal', headerShown: true, title: 'Add to books' }} />
              <Stack.Screen
                name="expense/new"
                options={{ presentation: 'modal', headerShown: true, title: 'Money out' }}
              />
              <Stack.Screen name="income/new" options={{ presentation: 'modal', headerShown: true, title: 'Money in' }} />
              <Stack.Screen name="reminders" options={{ headerShown: true, title: 'Reminders' }} />
              <Stack.Screen
                name="schedule/new"
                options={{ presentation: 'modal', headerShown: true, title: 'Repeating task' }}
              />
              <Stack.Screen name="activate" options={{ presentation: 'modal', headerShown: true, title: 'Subscription' }} />
              <Stack.Screen name="account" options={{ presentation: 'modal', headerShown: true, title: 'This phone' }} />
              <Stack.Screen name="agent/index" options={{ headerShown: true, title: 'Agent Portal' }} />
              <Stack.Screen name="agent/earnings" options={{ headerShown: true, title: 'What you earn' }} />
              <Stack.Screen
                name="referral"
                options={{ presentation: 'modal', headerShown: true, title: 'Referral Bonus' }}
              />
              <Stack.Screen
                name="agent/join"
                options={{ presentation: 'modal', headerShown: true, title: 'Become an Agent' }}
              />
              <Stack.Screen name="admin/index" options={{ headerShown: true, title: 'Admin Desk' }} />
              <Stack.Screen
                name="admin/new-agent"
                options={{ presentation: 'modal', headerShown: true, title: 'Register Agent' }}
              />
            </Stack>
            {/* Outside the navigator, so one list of write routes also covers deep links. */}
            <WriteRouteGuard />
            <UndoToastHost />
          </LicenseProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
