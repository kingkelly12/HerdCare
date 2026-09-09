import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeOutRight, LinearTransition, type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Surface } from '@/components/ui/Surface';
import type { Animal, Reminder } from '@/db/schema';
import { useColors } from '@/theme/colors';
import { SpeciesAvatar } from '@/components/animals/SpeciesIcon';
import { REMINDER_TYPE_META } from '@/utils/reminderRules';
import { daysFromToday, formatDateForDisplay } from '@/utils/livestockRules';

interface ReminderCardProps {
  reminder: Reminder;
  animal: Animal | null;
  onDone: () => void;
  onDismiss?: () => void;
  onPressAnimal?: () => void;
  index?: number;
}

function dueLabel(dueDate: string): { text: string; tone: 'overdue' | 'today' | 'upcoming' } {
  const days = daysFromToday(dueDate);
  if (days === null) return { text: '', tone: 'upcoming' };
  if (days < 0) return { text: days === -1 ? '1 day late' : `${Math.abs(days)} days late`, tone: 'overdue' };
  if (days === 0) return { text: 'Today', tone: 'today' };
  if (days === 1) return { text: 'Tomorrow', tone: 'upcoming' };
  return { text: `In ${days} days`, tone: 'upcoming' };
}

const TONE_CLASS = {
  overdue: 'text-danger',
  today: 'text-warn',
  upcoming: 'text-tertiary',
} as const;

/** The green "Done" panel revealed as the card is dragged aside. */
function DoneAction({ drag }: { drag: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    // Track the drag so the tick stays pinned to the card edge rather than sliding at half speed.
    transform: [{ translateX: drag.value + 96 }],
  }));

  return (
    <Animated.View style={style} className="my-0.5 w-24 items-center justify-center rounded-card bg-brand">
      <Ionicons name="checkmark-circle" size={30} color="#fff" />
      <Text className="text-caption font-sans-semibold uppercase text-white">Done</Text>
    </Animated.View>
  );
}

export function ReminderCard({ reminder, animal, onDone, onDismiss, onPressAnimal, index = 0 }: ReminderCardProps) {
  const colors = useColors();
  const swipeRef = useRef<SwipeableMethods>(null);
  const meta = REMINDER_TYPE_META[reminder.type];
  const due = dueLabel(reminder.dueDate);
  const accent = due.tone === 'overdue' ? colors.danger : due.tone === 'today' ? colors.warn : colors.brand;

  function complete() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onDone();
  }

  return (
    <Animated.View
      entering={FadeInDown.duration(260).delay(Math.min(index, 8) * 35)}
      exiting={FadeOutRight.duration(200)}
      layout={LinearTransition.springify().damping(18)}
    >
      <ReanimatedSwipeable
        ref={swipeRef}
        friction={1.6}
        rightThreshold={56}
        renderRightActions={(_progress, drag) => <DoneAction drag={drag} />}
        onSwipeableOpen={(dir) => {
          if (dir === 'right') complete();
        }}
      >
        <Surface level="raised" className="gap-3 p-4">
          <View className="flex-row items-start gap-3">
            {animal ? (
              <Pressable accessibilityRole="button" onPress={onPressAnimal}>
                <SpeciesAvatar
                  species={animal.species}
                  size={22}
                  tone={due.tone === 'overdue' ? 'danger' : due.tone === 'today' ? 'warn' : 'default'}
                />
              </Pressable>
            ) : (
              <View className="h-[42px] w-[42px] items-center justify-center rounded-pill bg-earth-soft">
                <Ionicons name={meta.icon} size={22} color={colors.earth} />
              </View>
            )}

            <View className="flex-1 gap-0.5">
              <Text className="text-body font-sans-semibold text-primary">{reminder.title}</Text>
              <Text className="text-callout text-secondary">
                {animal ? `${animal.tagNumber}${animal.name ? ` · ${animal.name}` : ''}` : 'Whole herd'}
              </Text>
              <Text className={`text-label font-sans-semibold ${TONE_CLASS[due.tone]}`}>
                {due.text} · {formatDateForDisplay(reminder.dueDate)}
              </Text>
            </View>

            <Ionicons name={meta.icon} size={20} color={accent} />
          </View>

          <Text className="text-label text-tertiary">{meta.why}</Text>

          <View className="flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              onPress={complete}
              className="min-h-[44px] flex-1 flex-row items-center justify-center gap-2 rounded-field bg-brand active:bg-brand-strong"
            >
              <Ionicons name="checkmark" size={20} color={colors.onBrand} />
              <Text className="text-callout font-sans-semibold text-on-brand">Done</Text>
            </Pressable>
            {onDismiss ? (
              <Pressable
                accessibilityRole="button"
                onPress={onDismiss}
                className="min-h-[44px] items-center justify-center rounded-field border border-line px-4 active:bg-sunken"
              >
                <Text className="text-callout font-sans-medium text-secondary">Skip</Text>
              </Pressable>
            ) : null}
          </View>
        </Surface>
      </ReanimatedSwipeable>
    </Animated.View>
  );
}
