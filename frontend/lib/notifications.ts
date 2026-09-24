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
import { addDaysYmd, daysBetweenYmd, todayYmd } from '@/lib/license/status';

export const ANDROID_CHANNEL_ID = 'herdcare-reminders';

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
/**
 * Long enough to cover a whole free trial from its first day. The end date is known the moment the
 * app is first opened, so the warning is scheduled then and still arrives for a farmer who has not
 * opened the app for months, which is exactly the farmer it most needs to reach.
 */
const RENEWAL_HORIZON_DAYS = 200;

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

/** A notification this module wants on the schedule. */
interface PlannedNotification {
  /** Stable, so a second run can recognise what the first one already scheduled. */
  identifier: string;
  title: string;
  body: string;
  screen: string;
  fireAt: Date;
}

/**
 * Notifications scheduled by other parts of the app, which this module must leave alone.
 * The agent's follow-up reminders are the only ones so far (see lib/agent/followUps.ts).
 */
export const FOREIGN_NOTIFICATION_PREFIXES = ['agent-'];

/**
 * Brings the phone's schedule of daily briefings and subscription warnings in line with the
 * database.
 *
 * Works out the full set of notifications that should exist, then changes only the ones that
 * differ. It used to cancel everything and schedule it all again on every launch, which on a cheap
 * phone meant dozens of calls into the notification system each time the app opened, for a
 * schedule that had almost always not changed.
 */
export async function rescheduleDigests(): Promise<void> {
  const granted = await ensureNotificationSetup();
  if (!granted) return;

  const planned = [...(await planRenewalNotices()), ...(await planDigests())];
  await applySchedule(planned);
}

/** Signature of a notification's visible content and time, for comparing old against new. */
function signature(title: string, body: string, fireAtMs: number | undefined): string {
  return `${title}|${body}|${fireAtMs ?? ''}`;
}

async function applySchedule(planned: PlannedNotification[]): Promise<void> {
  const now = Date.now();
  const wanted = new Map(
    planned
      .filter((item) => item.fireAt.getTime() > now)
      .map((item) => [item.identifier, item] as const),
  );

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const alreadyRight = new Set<string>();

  for (const request of scheduled) {
    const id = request.identifier;
    if (FOREIGN_NOTIFICATION_PREFIXES.some((prefix) => id.startsWith(prefix))) continue;

    const want = wanted.get(id);
    const fireAtMs = typeof request.content.data?.fireAt === 'number' ? request.content.data.fireAt : undefined;
    const matches =
      want !== undefined &&
      signature(request.content.title ?? '', request.content.body ?? '', fireAtMs) ===
        signature(want.title, want.body, want.fireAt.getTime());

    if (matches) {
      alreadyRight.add(id);
    } else {
      // Stale, changed, or left over from a version that did not use stable identifiers.
      await Notifications.cancelScheduledNotificationAsync(id);
    }
  }

  for (const [id, item] of wanted) {
    if (alreadyRight.has(id)) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title: item.title,
        body: item.body,
        data: { screen: item.screen, fireAt: item.fireAt.getTime() },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: item.fireAt,
        channelId: ANDROID_CHANNEL_ID,
      },
    });
  }
}

/** The daily briefings: one per day that has anything due, at the farmer's chosen time. */
async function planDigests(): Promise<PlannedNotification[]> {
  const settingsRow = await getSettings();
  if (!settingsRow?.digestEnabled) return [];

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

  const plans: PlannedNotification[] = [];
  for (const [dayKey, lines] of byDay) {
    const [year, month, day] = dayKey.split('-').map(Number);
    // A briefing whose time has already passed today is skipped rather than fired immediately;
    // applySchedule drops anything in the past.
    plans.push({
      identifier: `digest-${dayKey}`,
      title: lines.length === 1 ? 'HerdCare · 1 thing today' : `HerdCare · ${lines.length} things today`,
      body: summarise(lines),
      screen: '/reminders',
      fireAt: new Date(year, month - 1, day, settingsRow.digestHour, settingsRow.digestMinute, 0, 0),
    });
  }
  return plans;
}

/**
 * Warns the farmer before their free trial or subscription ends, from the phone itself.
 *
 * The end date is either inside the licence this device is carrying or, for the free trial,
 * counted from the day the app was first opened. Either way nothing here needs a server, a network,
 * or an SMS, and a farmer who never signs in is still warned. These are scheduled whatever the
 * husbandry digest is set to: turning off reminders about cows should not also turn off the warning
 * that the app is about to lock.
 */
async function planRenewalNotices(): Promise<PlannedNotification[]> {
  const status = await loadLicenseStatus();
  const today = todayYmd();

  let endsOn: string;
  let isTrial: boolean;
  let planLabel: string;

  if ('payload' in status) {
    endsOn = status.payload.exp;
    isTrial = status.payload.plan === 'trial';
    planLabel = PLAN_LABELS[status.payload.plan];
  } else if (status.state === 'trial') {
    endsOn = addDaysYmd(today, status.daysLeft);
    isTrial = true;
    planLabel = 'Your free trial';
  } else {
    // Nothing to say about a licence that is already dead; the app says that loudly on its own.
    return [];
  }

  const daysLeft = daysBetweenYmd(today, endsOn);
  // Nothing useful to schedule a century out for an owner licence.
  if (daysLeft < 0 || daysLeft > RENEWAL_HORIZON_DAYS) return [];

  const [year, month, day] = endsOn.split('-').map(Number);
  return RENEWAL_WARN_DAYS.filter((warnAt) => daysLeft >= warnAt).map((warnAt) => ({
    identifier: `renewal-${endsOn}-${warnAt}`,
    title: isTrial ? 'Your free trial is ending' : 'Your HerdCare subscription is ending',
    body:
      warnAt === 0
        ? `${planLabel} ends today. Subscribe in the app by M-Pesa to keep logging.`
        : `${warnAt} day${warnAt === 1 ? '' : 's'} left. ${isTrial ? 'Subscribe' : 'Renew'} in the app by M-Pesa to keep logging.`,
    screen: '/activate',
    // Morning of the day in question, so it lands with the milking rather than overnight.
    fireAt: new Date(year, month - 1, day - warnAt, 7, 0, 0, 0),
  }));
}
