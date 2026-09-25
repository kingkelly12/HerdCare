import '@/global.css';
import { useCallback, useEffect } from 'react';
import { AppState, InteractionManager, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack, ThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { db } from '@/db/client';
import { refreshRemindersAndNotifications } from '@/lib/reminderSync';
import { syncAgentLink } from '@/lib/referral';
import { refreshAgentFollowUps } from '@/lib/agent/followUps';
import { autoSyncBackup } from '@/lib/cloudSync';
import { NotificationRouter } from '@/components/NotificationRouter';
import { UndoToastHost } from '@/components/ui/UndoToast';
import { LicenseProvider } from '@/components/license/LicenseProvider';
import { WriteRouteGuard } from '@/components/license/WriteRouteGuard';
import { useColors, useIsDark } from '@/theme/colors';
import { useAppFonts } from '@/lib/fonts';
import migrations from '@/drizzle/migrations';

// Keep splash screen visible while fonts and database migrations initialize
SplashScreen.preventAutoHideAsync().catch(() => {});

// Last-resort guarantee. The splash blocks Android from drawing the app at all until it is told to
// hide, so if anything below ever fails to release it, the phone would sit on the splash forever.
// This lets go regardless after a few seconds; a slow start then shows the app or an error screen.
setTimeout(() => SplashScreen.hide(), 5000);

/** How long after the first screen settles before launch housekeeping runs. */
const STARTUP_HOUSEKEEPING_DELAY_MS = 2500;

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);
  const colors = useColors();
  const isDark = useIsDark();

  const [fontsLoaded, fontError] = useAppFonts();

  const ready = success && (fontsLoaded || !!fontError);

  useEffect(() => {
    if (ready || error) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [ready, error]);

  const handleFirstLayout = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // Re-deriving reminders and re-queuing the daily briefings is housekeeping, not something the
  // first screen needs: Today refreshes its own reminders as soon as it appears. Run at launch, this
  // used to compete with drawing that first screen for the one JavaScript thread, keeping the
  // splash up for seconds after the app was actually ready. So it waits until the first screen
  // has settled, and then a moment more.
  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const task = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        // In order, not all at once: the reminder refresh settles the notification schedule before
        // the agent's follow-ups are laid over it. The two network calls are quiet no-ops with no
        // signal, or on a phone that has never linked to an agent or signed in as one.
        refreshRemindersAndNotifications()
          .catch(() => {})
          .then(() => syncAgentLink())
          .catch(() => {})
          .then(() => refreshAgentFollowUps())
          .catch(() => {})
          .then(() => autoSyncBackup())
          .catch(() => {});
      }, STARTUP_HOUSEKEEPING_DELAY_MS);
    });
    return () => {
      task.cancel();
      if (timer) clearTimeout(timer);
    };
  }, [ready]);

  // Coming back to the app after logging things elsewhere, or after regaining signal, is the other
  // natural moment to save a copy online. Throttled inside, and silent: it never interrupts.
  useEffect(() => {
    if (!ready) return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') autoSyncBackup().catch(() => {});
    });
    return () => subscription.remove();
  }, [ready]);

  if (error) {
    return (
      <View className="flex-1 items-center justify-center gap-2 bg-canvas p-6" onLayout={handleFirstLayout}>
        <Text className="text-headline font-sans-semibold text-danger">Could not open the local database</Text>
        <Text className="text-center text-callout text-secondary">{error.message}</Text>
      </View>
    );
  }

  // Render nothing while fonts load and the database migrates. With nothing drawn, the full-screen
  // artwork — Android's window background — stays visible, so this wait looks like the splash.
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
    // `flex: 1` must live in `style`, not `className`. Passing both lets the explicit style replace the
    // class, which collapsed this root to zero height: the whole app rendered, invisibly, over a blank
    // window. The canvas colour keeps the window background from showing through transparent frames.
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.canvas }} onLayout={handleFirstLayout}>
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
              <Stack.Screen name="account" options={{ presentation: 'modal', headerShown: true, title: 'New phone' }} />
              <Stack.Screen name="agent/index" options={{ headerShown: true, title: 'Agent Portal' }} />
              <Stack.Screen name="agent/earnings" options={{ headerShown: true, title: 'What you earn' }} />
              <Stack.Screen
                name="referral"
                options={{ presentation: 'modal', headerShown: true, title: 'Your agent' }}
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
            <NotificationRouter />
            <UndoToastHost />
          </LicenseProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
