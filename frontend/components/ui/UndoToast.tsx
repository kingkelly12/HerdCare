import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

interface ToastRequest {
  message: string;
  onUndo: () => void | Promise<void>;
}

// A bare module-level pub/sub rather than React context: the two screens that trigger this
// (animal detail, the Herd bulk-action bar) have no ancestor/descendant relationship worth
// threading a provider through, and the host is mounted once at the root regardless.
type Listener = (request: ToastRequest | null) => void;
let listener: Listener | null = null;

const VISIBLE_MS = 6000;
// A flat offset rather than measuring the tab bar or FAB: this toast can appear over the tab
// screens (tab bar), the animal detail screen (FAB), or the herd list (bulk-action bar), and no
// single insets calculation clears all three. This clears the tallest of them with room to spare.
const BOTTOM_OFFSET = 100;

/** Shows a bottom toast with a single Undo action. Call from anywhere once `<UndoToastHost />` is mounted. */
export function showUndoToast(request: ToastRequest) {
  listener?.(request);
}

/** Mount once near the root, above the navigator, so the toast can float over any screen. */
export function UndoToastHost() {
  const [toast, setToast] = useState<ToastRequest | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listener = (request) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setToast(request);
      if (request) {
        timerRef.current = setTimeout(() => setToast(null), VISIBLE_MS);
      }
    };
    return () => {
      listener = null;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!toast) return null;

  async function handleUndo() {
    if (timerRef.current) clearTimeout(timerRef.current);
    const request = toast;
    setToast(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await request?.onUndo();
  }

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18)}
      exiting={FadeOutDown.duration(180)}
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 16, right: 16, bottom: BOTTOM_OFFSET }}
    >
      <View
        className="flex-row items-center gap-3 rounded-field bg-raised px-4 py-3"
        style={{ elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}
      >
        <Text numberOfLines={2} className="flex-1 text-callout font-sans-medium text-primary">
          {toast.message}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={handleUndo}
          hitSlop={8}
          className="min-h-touch items-center justify-center rounded-pill px-3 active:bg-sunken"
        >
          <Text className="text-callout font-sans-bold text-brand">Undo</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
