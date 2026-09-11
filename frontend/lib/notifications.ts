import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { and, asc, eq, lte } from 'drizzle-orm';
import { db } from '@/db/client';
import { getSettings } from '@/db/reminders';
import { animals, reminders } from '@/db/schema';
import { addDaysIso, startOfTodayIso } from '@/utils/livestockRules';
import { isReminderTypeEnabled } from '@/utils/reminderRules';
import { loadLicenseStatus } from '@/db/license';
import { PLAN_LABELS } from '@/lib/license/token';
import { daysBetweenYmd, todayYmd } from '@/lib/license/status';

const ANDROID_CHANNEL_ID = 'herdcare-reminders';

/**
 * How many days of digests we schedule ahead. One notification per day keeps us far below the
 * 64 pending-notification ceiling iOS enforces, which a naive one-notification-per-reminder
 * design would blow past silently on any real herd.
 */
const DIGEST_HORIZON_DAYS = 30;

/**
 * How many days before a subscription lapses the farmer is warned, and how far ahead we bother
 * scheduling at all.
 *
 * These run as *local* notifications rather than an SMS from the server. The phone already knows
 * its own expiry date, because it is written inside the signed licence, so warning the farmer
 * costs nothing, needs no network, and works whether or not they have ever signed in. An SMS is
 * only worth paying for to reach somebody whose phone is off or who has uninstalled the app.
 */
const RENEWAL_WARN_DAYS = [7, 3, 0];
const RENEWAL_HORIZON_DAYS = 60;

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

  const granted = await ensureNotificationSetup();
  if (!granted) return;

  // Subscription warnings are scheduled whatever the husbandry digest is set to. Turning off
  // reminders about cows should not also turn off the warning that the app is about to lock.
  await scheduleRenewalNotices();

  const settingsRow = await getSettings();
  if (!settingsRow?.digestEnabled) return;

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
    if (!isReminderTypeEnabled(settingsRow, reminder.type)) continue;
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


/**
 * Warns the farmer before their subscription lapses, from the phone itself.
 *
 * The expiry is inside the licence this device is already carrying, so nothing here needs a
 * server, a network, or an SMS. A farmer who never signs in still gets warned.
 */
async function scheduleRenewalNotices(): Promise<void> {
  const status = await loadLicenseStatus();
  if (!('payload' in status)) return;

  const { payload } = status;
  const daysLeft = daysBetweenYmd(todayYmd(), payload.exp);

  // Nothing to say about a licence that is already dead — the app says that loudly on its own —
  // and nothing useful to schedule a century out for an owner licence.
  if (daysLeft < 0 || daysLeft > RENEWAL_HORIZON_DAYS) return;

  const isTrial = payload.plan === 'trial';
  const now = Date.now();

  for (const warnAt of RENEWAL_WARN_DAYS) {
    if (daysLeft < warnAt) continue;

    const [year, month, day] = payload.exp.split('-').map(Number);
    // Morning of the day in question, so it lands with the milking rather than overnight.
    const fireAt = new Date(year, month - 1, day - warnAt, 7, 0, 0, 0);
    if (fireAt.getTime() <= now) continue;

    const title = isTrial ? 'Your free trial is ending' : 'Your HerdCare subscription is ending';
    const body =
      warnAt === 0
        ? `${PLAN_LABELS[payload.plan]} ends today. Renew in the app by M-Pesa to keep logging.`
        : `${warnAt} day${warnAt === 1 ? '' : 's'} left. Renew in the app by M-Pesa to keep logging.`;

    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { screen: '/activate' } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
        channelId: ANDROID_CHANNEL_ID,
      },
    });
  }
}
