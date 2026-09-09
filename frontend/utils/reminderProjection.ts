import type { Animal, BirthRecord, BreedingEvent, HealthLog, ReminderSourceTable, ReminderType } from '@/db/schema';
import { addDaysIso } from './livestockRules';
import { REMINDER_TYPE_META, SERVICE_EVENT_TYPES, heatReturnDays } from './reminderRules';

export interface DerivedReminder {
  sourceTable: ReminderSourceTable;
  sourceEventId: string;
  type: ReminderType;
  animalId: string;
  title: string;
  dueDate: string;
  leadDays: number;
}

export interface ProjectionInput {
  animals: Animal[];
  breedingEvents: BreedingEvent[];
  birthRecords: BirthRecord[];
  healthLogs: HealthLog[];
  /** Reminders older than this are dropped rather than surfaced as ancient overdue noise. */
  floorDate: string;
}

/**
 * Works out which reminders the logged events currently imply.
 *
 * Pure and side-effect free so the superseding rules can be tested directly: getting these wrong
 * is what makes an app nag about a calving that already happened, which is how farmers learn to
 * ignore notifications altogether.
 */
export function computeDerivedReminders({
  animals,
  breedingEvents,
  birthRecords,
  healthLogs,
  floorDate,
}: ProjectionInput): DerivedReminder[] {
  const animalById = new Map(animals.map((animal) => [animal.id, animal]));
  const out: DerivedReminder[] = [];

  for (const event of breedingEvents) {
    if (!(SERVICE_EVENT_TYPES as readonly string[]).includes(event.eventType)) continue;
    const animal = animalById.get(event.animalId);
    if (!animal) continue;

    // Any breeding event logged after this service — a return to heat, a re-service, a birth —
    // means this service's projections no longer describe the animal.
    const supersededByEvent = breedingEvents.some(
      (other) => other.animalId === event.animalId && other.eventDate > event.eventDate,
    );
    const supersededByBirth = birthRecords.some(
      (birth) => birth.motherId === event.animalId && birth.birthDate >= event.eventDate,
    );
    if (supersededByEvent || supersededByBirth) continue;

    out.push({
      sourceTable: 'breeding_events',
      sourceEventId: event.id,
      type: 'heat_return',
      animalId: event.animalId,
      title: REMINDER_TYPE_META.heat_return.label,
      dueDate: addDaysIso(event.eventDate, heatReturnDays(animal.species)),
      leadDays: REMINDER_TYPE_META.heat_return.defaultLeadDays,
    });

    if (event.expectedDueDate) {
      out.push({
        sourceTable: 'breeding_events',
        sourceEventId: event.id,
        type: 'birth_due',
        animalId: event.animalId,
        title: REMINDER_TYPE_META.birth_due.label,
        dueDate: event.expectedDueDate,
        leadDays: REMINDER_TYPE_META.birth_due.defaultLeadDays,
      });
    }
  }

  for (const birth of birthRecords) {
    if (!birth.weaningDueDate) continue;
    const alreadyWeaned = breedingEvents.some(
      (event) => event.animalId === birth.motherId && event.eventType === 'weaned' && event.eventDate >= birth.birthDate,
    );
    if (alreadyWeaned) continue;

    out.push({
      sourceTable: 'birth_records',
      sourceEventId: birth.id,
      type: 'weaning_due',
      animalId: birth.motherId,
      title: REMINDER_TYPE_META.weaning_due.label,
      dueDate: birth.weaningDueDate,
      leadDays: REMINDER_TYPE_META.weaning_due.defaultLeadDays,
    });
  }

  for (const log of healthLogs) {
    if (!log.withdrawalEndDate) continue;
    out.push({
      sourceTable: 'health_logs',
      sourceEventId: log.id,
      type: 'withdrawal_end',
      animalId: log.animalId,
      title: REMINDER_TYPE_META.withdrawal_end.label,
      dueDate: log.withdrawalEndDate,
      leadDays: REMINDER_TYPE_META.withdrawal_end.defaultLeadDays,
    });
  }

  return out.filter((reminder) => reminder.dueDate >= floorDate);
}
