import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { and, asc, eq, lte } from 'drizzle-orm';
import { db } from '@/db/client';
import { getSettings } from '@/db/reminders';
import { animals, reminders, type Reminder, type Settings } from '@/db/schema';
import { addDaysIso, startOfTodayIso } from '@/utils/livestockRules';

const ANDROID_CHANNEL_ID = 'herdcare-reminders';

/**
 * How many days of digests we schedule ahead. One notification per day keeps us far below the
 * 64 pending-notification ceiling iOS enforces, which a naive one-notification-per-reminder
 * design would blow past silently on any real herd.
 */
const DIGEST_HORIZON_DAYS = 30;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function ensureNotificationSetup(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Herd reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (!existing.canAskAgain) return false;

  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return requested.granted;
}

function typeEnabled(settingsRow: Settings, reminder: Reminder): boolean {
  switch (reminder.type) {
    case 'heat_return':
      return settingsRow.remindHeatReturn;
    case 'birth_due':
      return settingsRow.remindBirthDue;
    case 'withdrawal_end':
      return settingsRow.remindWithdrawalEnd;
    case 'weaning_due':
      return settingsRow.remindWeaningDue;
    case 'routine':
      return settingsRow.remindRoutine;
    default:
      return true;
  }
}

/** Local-day key (YYYY-MM-DD) for an ISO instant, so digests group by the farmer's calendar. */
function localDayKey(iso: string): string {
  const date = new Date(iso);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function summarise(lines: string[]): string {
  if (lines.length <= 3) return lines.join(' · ');
  return `${lines.slice(0, 3).join(' · ')} · +${lines.length - 3} more`;
}

/**
 * Rebuilds the schedule of daily briefings.
 *
 * Cheap and idempotent by design — cancel everything, then re-derive from the reminders table —
 * so it can simply be re-run after any write rather than trying to patch individual
 * notifications in step with the database.
 */
export async function rescheduleDigests(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();

  const settingsRow = await getSettings();
  if (!settingsRow?.digestEnabled) return;

  const granted = await ensureNotificationSetup();
  if (!granted) return;

  const horizonEnd = addDaysIso(startOfTodayIso(), DIGEST_HORIZON_DAYS);
  const rows = await db
    .select({ reminder: reminders, animal: animals })
    .from(reminders)
    .leftJoin(animals, eq(reminders.animalId, animals.id))
    .where(and(eq(reminders.status, 'pending'), lte(reminders.dueDate, horizonEnd)))
    .orderBy(asc(reminders.dueDate));

  // Everything already overdue rides along on the next briefing rather than being lost.
  const todayKey = localDayKey(startOfTodayIso());
  const byDay = new Map<string, string[]>();

  for (const { reminder, animal } of rows) {
    if (!typeEnabled(settingsRow, reminder)) continue;
    const dueKey = localDayKey(reminder.dueDate);
    const key = dueKey < todayKey ? todayKey : dueKey;
    const label = animal ? `${animal.tagNumber} ${reminder.title.toLowerCase()}` : reminder.title;
    byDay.set(key, [...(byDay.get(key) ?? []), label]);
  }

  const now = Date.now();
  for (const [dayKey, lines] of byDay) {
    const [year, month, day] = dayKey.split('-').map(Number);
    const fireAt = new Date(year, month - 1, day, settingsRow.digestHour, settingsRow.digestMinute, 0, 0);
    // A briefing whose time has already passed today is skipped rather than fired immediately.
    if (fireAt.getTime() <= now) continue;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: lines.length === 1 ? 'HerdCare · 1 thing today' : `HerdCare · ${lines.length} things today`,
        body: summarise(lines),
        data: { screen: '/reminders' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
        channelId: ANDROID_CHANNEL_ID,
      },
    });
  }
}
