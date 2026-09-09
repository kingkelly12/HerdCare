import { useCallback } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { asc, eq } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Fab } from '@/components/ui/Fab';
import { EmptyState } from '@/components/ui/EmptyState';
import { ReminderCard } from '@/components/reminders/ReminderCard';
import { db } from '@/db/client';
import { completeReminder, dismissReminder } from '@/db/reminders';
import { animals, reminderSchedules, reminders, settings } from '@/db/schema';
import { refreshRemindersAndNotifications, refreshReminderData } from '@/lib/reminderSync';
import { daysFromToday } from '@/utils/livestockRules';
import { isReminderTypeEnabled } from '@/utils/reminderRules';
import { SPECIES_RULES } from '@/utils/livestockRules';

export default function RemindersScreen() {
  useFocusEffect(
    useCallback(() => {
      refreshReminderData().catch(() => {});
    }, []),
  );

  // The schedule is joined so a routine reminder can say what it actually applies to — a task
  // scoped to goats used to read the same as one for the whole herd.
  const { data } = useLiveQuery(
    db
      .select({ reminder: reminders, animal: animals, schedule: reminderSchedules })
      .from(reminders)
      .leftJoin(animals, eq(reminders.animalId, animals.id))
      .leftJoin(reminderSchedules, eq(reminders.scheduleId, reminderSchedules.id))
      .where(eq(reminders.status, 'pending'))
      .orderBy(asc(reminders.dueDate)),
  );

  const { data: settingsRows } = useLiveQuery(db.select().from(settings).where(eq(settings.id, 'default')));
  const prefs = settingsRows?.[0];

  // Switching a type off in Settings hides it here too, not just in the daily notification.
  const rows = (data ?? []).filter((row) => isReminderTypeEnabled(prefs, row.reminder.type));
  const overdue = rows.filter((row) => (daysFromToday(row.reminder.dueDate) ?? 0) < 0);
  const today = rows.filter((row) => daysFromToday(row.reminder.dueDate) === 0);
  const soon = rows.filter((row) => {
    const days = daysFromToday(row.reminder.dueDate) ?? 0;
    return days > 0 && days <= row.reminder.leadDays + 7;
  });
  const later = rows.filter((row) => {
    const days = daysFromToday(row.reminder.dueDate) ?? 0;
    return days > row.reminder.leadDays + 7;
  });

  // Rescheduling notifications is not awaited in either handler — see the note in
  // log/breeding.tsx. It can block on an OS permission dialog, and swiping through several
  // reminders in a row would otherwise queue up that wait behind each card.
  async function handleDone(id: string) {
    await completeReminder(id);
    refreshRemindersAndNotifications().catch(() => {});
  }

  async function handleDismiss(id: string) {
    await dismissReminder(id);
    refreshRemindersAndNotifications().catch(() => {});
  }

  const sections = [
    { title: 'Overdue', tone: 'text-danger', rows: overdue },
    { title: 'Today', tone: 'text-warn', rows: today },
    { title: 'Coming up', tone: 'text-secondary', rows: soon },
    { title: 'Later', tone: 'text-tertiary', rows: later },
  ].filter((section) => section.rows.length > 0);

  return (
    <ScreenContainer fab={<Fab icon="repeat" label="Repeating task" onPress={() => router.push('/schedule/new')} />}>
      {sections.length === 0 ? (
        <EmptyState
          icon="checkmark-done-outline"
          title="Nothing due"
          description="Reminders appear here on their own when you log a service, treatment or birth."
        />
      ) : (
        <>
          <Animated.View entering={FadeInDown.duration(240)} className="pt-2">
            <Text className="text-label text-tertiary">Swipe a card left to mark it done.</Text>
          </Animated.View>
          {sections.map((section) => (
            <View key={section.title} className="gap-2">
              <Text className={`text-label font-sans-semibold uppercase ${section.tone}`}>
                {section.title} · {section.rows.length}
              </Text>
              {section.rows.map(({ reminder, animal, schedule }, i) => (
                <ReminderCard
                  key={reminder.id}
                  reminder={reminder}
                  animal={animal}
                  scopeLabel={
                    schedule
                      ? schedule.speciesFilter
                        ? `All ${SPECIES_RULES[schedule.speciesFilter].label.toLowerCase()}s`
                        : 'Whole herd'
                      : undefined
                  }
                  index={i}
                  onDone={() => handleDone(reminder.id)}
                  onDismiss={() => handleDismiss(reminder.id)}
                  onPressAnimal={animal ? () => router.push(`/animal/${animal.id}`) : undefined}
                />
              ))}
            </View>
          ))}
        </>
      )}
      <View className="h-24" />
    </ScreenContainer>
  );
}
