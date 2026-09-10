import { and, eq, inArray, isNotNull, lt, ne } from 'drizzle-orm';
import { db } from './client';
import {
  animals,
  birthRecords,
  breedingEvents,
  DERIVED_REMINDER_TYPES,
  flockEvents,
  flocks,
  hatchBatches,
  healthLogs,
  reminderSchedules,
  reminders,
  settings,
} from './schema';
import { addDaysIso, startOfTodayIso } from '@/utils/livestockRules';
import { REMINDER_TYPE_META } from '@/utils/reminderRules';
import { computeDerivedReminders } from '@/utils/reminderProjection';
import { computeHatchReminders, computePoultryReminders } from '@/utils/poultryProjection';

/**
 * Anything older than this is not worth surfacing — a farmer entering a season of back-history
 * should not be greeted by hundreds of overdue reminders for events that are long settled.
 */
const MAX_OVERDUE_DAYS = 30;

/**
 * Recomputes every derived reminder from the events the farmer has logged.
 *
 * Deliberately a full rebuild rather than incremental bookkeeping: reminders are a *projection*
 * of the event log, and a projection that can drift from its source is worse than no projection —
 * it nags about a calving that already happened, and the farmer stops trusting the app. The data
 * is small (a farm has hundreds of events, not millions), so correctness beats cleverness here.
 *
 * Reminders the farmer has already actioned keep their status; only pending ones are superseded.
 */
export async function rebuildDerivedReminders(): Promise<void> {
  const floor = addDaysIso(startOfTodayIso(), -MAX_OVERDUE_DAYS);

  const [animalRows, breedingRows, birthRows, healthRows, flockRows, hatchRows] = await Promise.all([
    db.select().from(animals),
    db.select().from(breedingEvents),
    db.select().from(birthRecords),
    db.select().from(healthLogs).where(isNotNull(healthLogs.withdrawalEndDate)),
    db.select().from(flocks),
    db.select().from(hatchBatches),
  ]);

  const fresh = computeDerivedReminders({
    animals: animalRows,
    breedingEvents: breedingRows,
    birthRecords: birthRows,
    healthLogs: healthRows,
    floorDate: floor,
  });

  // Poultry rides the same projection: the flock's age implies its vaccinations, feed changes and
  // deworming exactly as a service date implies a due date. `sourceTable: 'flocks'` with a
  // `flockId:itemKey` source id gives each scheduled item its own row per flock under the
  // existing natural key, so the upsert and the stale sweep below need no special cases.
  const poultry = computePoultryReminders({ flocks: flockRows, floorDate: floor, today: startOfTodayIso() }).map(
    (reminder) => ({
      sourceTable: 'flocks' as const,
      sourceEventId: reminder.sourceEventId,
      type: reminder.type,
      animalId: null,
      flockId: reminder.flockId,
      title: reminder.title,
      dueDate: reminder.dueDate,
      leadDays: reminder.leadDays,
      notes: reminder.notes,
    }),
  );

  const hatching = computeHatchReminders({ batches: hatchRows, floorDate: floor }).map((reminder) => ({
    sourceTable: 'hatch_batches' as const,
    sourceEventId: reminder.sourceEventId,
    type: 'hatching' as const,
    animalId: null,
    flockId: null,
    hatchBatchId: reminder.hatchBatchId,
    title: reminder.title,
    dueDate: reminder.dueDate,
    leadDays: reminder.leadDays,
    notes: reminder.notes,
  }));

  const now = new Date().toISOString();

  for (const reminder of [...fresh, ...poultry, ...hatching]) {
    await db
      .insert(reminders)
      .values({ ...reminder, status: 'pending' })
      .onConflictDoUpdate({
        target: [reminders.sourceTable, reminders.sourceEventId, reminders.type],
        // Status is deliberately absent: a reminder the farmer already ticked off must not
        // spring back to pending just because the projection was recomputed.
        set: {
          animalId: 'animalId' in reminder ? reminder.animalId : null,
          flockId: 'flockId' in reminder ? reminder.flockId : null,
          hatchBatchId: 'hatchBatchId' in reminder ? reminder.hatchBatchId : null,
          title: reminder.title,
          dueDate: reminder.dueDate,
          leadDays: reminder.leadDays,
          updatedAt: now,
        },
      });
  }

  // Drop pending derived reminders whose source no longer implies them.
  const keep = new Set(
    [...fresh, ...poultry, ...hatching].map((r) => `${r.sourceTable}|${r.sourceEventId}|${r.type}`),
  );
  const existing = await db
    .select({ id: reminders.id, sourceTable: reminders.sourceTable, sourceEventId: reminders.sourceEventId, type: reminders.type })
    .from(reminders)
    .where(and(eq(reminders.status, 'pending'), inArray(reminders.type, [...DERIVED_REMINDER_TYPES])));

  const stale = existing
    .filter((row) => !keep.has(`${row.sourceTable}|${row.sourceEventId}|${row.type}`))
    .map((row) => row.id);

  if (stale.length > 0) {
    await db.delete(reminders).where(inArray(reminders.id, stale));
  }
}

/** Makes sure every active routine schedule has exactly one pending reminder outstanding. */
export async function syncRoutineReminders(): Promise<void> {
  const schedules = await db.select().from(reminderSchedules).where(eq(reminderSchedules.active, true));
  const open = await db
    .select({ scheduleId: reminders.scheduleId })
    .from(reminders)
    .where(and(eq(reminders.type, 'routine'), eq(reminders.status, 'pending')));
  const openScheduleIds = new Set(open.map((row) => row.scheduleId));

  for (const schedule of schedules) {
    if (openScheduleIds.has(schedule.id)) continue;
    await db.insert(reminders).values({
      scheduleId: schedule.id,
      type: 'routine',
      title: schedule.title,
      dueDate: schedule.nextDueDate,
      leadDays: REMINDER_TYPE_META.routine.defaultLeadDays,
      status: 'pending',
    });
  }
}

/** Marks a reminder done. Routine reminders roll their schedule forward to the next occurrence. */
export async function completeReminder(reminderId: string): Promise<void> {
  const now = new Date().toISOString();
  const [reminder] = await db.select().from(reminders).where(eq(reminders.id, reminderId));
  if (!reminder) return;

  await db.update(reminders).set({ status: 'done', completedAt: now, updatedAt: now }).where(eq(reminders.id, reminderId));

  // Ticking off a poultry reminder writes it onto the flock's own timeline, so the record of what
  // was actually given lives with the flock rather than only as a reminder that stopped showing.
  if (reminder.flockId && (reminder.type === 'vaccination' || reminder.type === 'feed_change' || reminder.type === 'deworming')) {
    await db.insert(flockEvents).values({
      flockId: reminder.flockId,
      type: reminder.type === 'feed_change' ? 'feed_change' : reminder.type === 'deworming' ? 'deworming' : 'vaccination',
      eventDate: startOfTodayIso(),
      description: reminder.title,
    });
  }

  if (reminder.type === 'routine' && reminder.scheduleId) {
    const [schedule] = await db.select().from(reminderSchedules).where(eq(reminderSchedules.id, reminder.scheduleId));
    if (schedule?.active) {
      // Count from today rather than the original due date, so a task done two weeks late does
      // not immediately come due again.
      const nextDueDate = addDaysIso(startOfTodayIso(), schedule.intervalDays);
      await db
        .update(reminderSchedules)
        .set({ nextDueDate, updatedAt: now })
        .where(eq(reminderSchedules.id, schedule.id));
      await db.insert(reminders).values({
        scheduleId: schedule.id,
        type: 'routine',
        title: schedule.title,
        dueDate: nextDueDate,
        leadDays: REMINDER_TYPE_META.routine.defaultLeadDays,
        status: 'pending',
      });
    }
  }
}

export async function dismissReminder(reminderId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.update(reminders).set({ status: 'dismissed', updatedAt: now }).where(eq(reminders.id, reminderId));
}

/** Clears out actioned reminders that are well past, so the table does not grow without bound. */
export async function pruneOldReminders(): Promise<void> {
  await db
    .delete(reminders)
    .where(and(ne(reminders.status, 'pending'), lt(reminders.dueDate, addDaysIso(startOfTodayIso(), -180))));
}

const DEFAULT_SETTINGS_ID = 'default';

/** Reads the single settings row, creating it with defaults on first run. */
export async function getSettings() {
  const [existing] = await db.select().from(settings).where(eq(settings.id, DEFAULT_SETTINGS_ID));
  if (existing) return existing;
  const [created] = await db.insert(settings).values({ id: DEFAULT_SETTINGS_ID }).returning();
  return created;
}

export async function updateSettings(patch: Partial<typeof settings.$inferInsert>) {
  await getSettings();
  await db
    .update(settings)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(settings.id, DEFAULT_SETTINGS_ID));
}
