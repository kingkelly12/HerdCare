import { reconcileWithdrawalStatuses } from '@/db/queries';
import { pruneOldReminders, rebuildDerivedReminders, syncRoutineReminders } from '@/db/reminders';
import { rescheduleDigests } from './notifications';

/** Recomputes the reminder projection from the event log. Safe to call as often as you like. */
export async function refreshReminderData(): Promise<void> {
  await reconcileWithdrawalStatuses();
  await rebuildDerivedReminders();
  await syncRoutineReminders();
}

/**
 * Full refresh: reminder data plus the queued daily briefings. Run after anything that could
 * change what is due — a logged event, an edited schedule, a settings change — and at launch.
 */
export async function refreshRemindersAndNotifications(): Promise<void> {
  await refreshReminderData();
  await pruneOldReminders();
  await rescheduleDigests();
}
