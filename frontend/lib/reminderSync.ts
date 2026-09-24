import { reconcileWithdrawalStatuses } from '@/db/queries';
import { pruneOldReminders, rebuildDerivedReminders, syncRoutineReminders } from '@/db/reminders';
import { rescheduleDigests } from './notifications';

/** The refresh currently running, if any. */
let inFlight: Promise<void> | null = null;

/**
 * Recomputes the reminder projection from the event log. Safe to call as often as you like.
 *
 * Callers that arrive while a refresh is already running share it rather than starting a second
 * one. At launch the Today screen and the app's own housekeeping both ask for this within moments
 * of each other, and two rebuilds racing each other on the one JavaScript thread only doubled the
 * work without changing the answer.
 */
export function refreshReminderData(): Promise<void> {
  if (!inFlight) {
    inFlight = (async () => {
      await reconcileWithdrawalStatuses();
      await rebuildDerivedReminders();
      await syncRoutineReminders();
    })().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
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
