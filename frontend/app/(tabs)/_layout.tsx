import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/theme/colors';

// The height a tab bar would want on a device with no inset at all (no home indicator, no
// gesture-nav pill) — insets.bottom is added on top of this, never used as a substitute for it.
const BASE_TAB_BAR_HEIGHT = 56;

export default function TabsLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.tertiary,
        tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11, letterSpacing: 0.2 },
        tabBarStyle: {
          // react-navigation's bottom tab bar accounts for the safe area automatically — but
          // only until `tabBarStyle.height` is set explicitly, which opts out of that and is
          // what let the Android gesture-nav pill sit on top of the tab bar. insets.bottom
          // restores it by hand.
          height: BASE_TAB_BAR_HEIGHT + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'sunny' : 'sunny-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="animals"
        options={{
          title: 'Herd',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'paw' : 'paw-outline'} size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'settings' : 'settings-outline'} size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
