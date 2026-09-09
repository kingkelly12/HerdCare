import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as Print from 'expo-print';
import { inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  animals,
  birthRecords,
  breedingEvents,
  healthLogs,
  reminderSchedules,
  settings,
  type Animal,
  type BirthRecord,
  type BreedingEvent,
  type HealthLog,
  type ReminderSchedule,
} from '@/db/schema';
import { updateSettings } from '@/db/reminders';
import { buildBackupReportHtml } from './backupReport';

export const BACKUP_FORMAT = 'herdcare-backup';
export const BACKUP_VERSION = 1;

/**
 * A backup bundle.
 *
 * Deliberately JSON rather than a copy of the SQLite file: it can be inspected, validated and
 * migrated across schema versions, and restoring it can *merge* rather than blindly overwrite.
 * The `reminders` table is intentionally excluded — it is a projection of the event log and is
 * rebuilt automatically after a restore.
 */
export interface BackupBundle {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  counts: Record<string, number>;
  data: {
    animals: Animal[];
    breedingEvents: BreedingEvent[];
    birthRecords: BirthRecord[];
    healthLogs: HealthLog[];
    reminderSchedules: ReminderSchedule[];
    settings: Record<string, unknown>[];
  };
}

function dateStamp(date = new Date()): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
}

export async function buildBackup(): Promise<BackupBundle> {
  const [animalRows, breedingRows, birthRows, healthRows, scheduleRows, settingsRows] = await Promise.all([
    db.select().from(animals),
    db.select().from(breedingEvents),
    db.select().from(birthRecords),
    db.select().from(healthLogs),
    db.select().from(reminderSchedules),
    db.select().from(settings),
  ]);

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    counts: {
      animals: animalRows.length,
      breedingEvents: breedingRows.length,
      birthRecords: birthRows.length,
      healthLogs: healthRows.length,
      reminderSchedules: scheduleRows.length,
    },
    data: {
      animals: animalRows,
      breedingEvents: breedingRows,
      birthRecords: birthRows,
      healthLogs: healthRows,
      reminderSchedules: scheduleRows,
      settings: settingsRows as unknown as Record<string, unknown>[],
    },
  };
}

export interface ExportResult {
  fileName: string;
  uri: string;
  counts: Record<string, number>;
  shared: boolean;
}

async function shareFile(uri: string, fileName: string, mimeType: string, dialogTitle: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType, dialogTitle, UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : 'public.json' });
  return true;
}

/**
 * Renders the records as a PDF report and hands it to the OS share sheet — this is the default,
 * farmer-facing "Back up my records" action. Unlike the JSON export below, a PDF can be opened
 * and actually read by anyone (the farmer, a vet, a buyer) without the app, which is the whole
 * point of it existing separately from the technical backup.
 *
 * A PDF cannot be reliably parsed back into structured data, so it does not feed Restore — see
 * `exportJsonBackup` for that. Creating either counts toward "the farmer now holds an external
 * copy", so both update `lastBackupAt`.
 */
export async function exportPdfReport(): Promise<ExportResult> {
  const bundle = await buildBackup();
  const html = buildBackupReportHtml(bundle);
  const { uri: printUri } = await Print.printToFileAsync({ html, base64: false });

  // printToFileAsync names the file itself; renaming it gives the share sheet and the farmer's
  // downloads folder something identifiable instead of a random cache filename.
  const fileName = `herdcare-records-${dateStamp()}.pdf`;
  const file = new File(printUri);
  const renamed = new File(Paths.cache, fileName);
  if (renamed.exists) renamed.delete();
  file.moveSync(renamed);

  const shared = await shareFile(renamed.uri, fileName, 'application/pdf', 'Save your HerdCare records');
  await updateSettings({ lastBackupAt: new Date().toISOString() });
  return { fileName, uri: renamed.uri, counts: bundle.counts, shared };
}

/**
 * Writes the full structured backup and hands it to the OS share sheet. This is the file
 * "Restore from a backup" reads — a farmer who only ever shares the PDF report has a readable
 * record but nothing that can repopulate a new phone, so Settings surfaces this as a distinct,
 * clearly-labelled second action rather than folding it into the PDF button.
 */
export async function exportJsonBackup(): Promise<ExportResult> {
  const bundle = await buildBackup();
  const fileName = `herdcare-backup-${dateStamp()}.json`;
  const file = new File(Paths.cache, fileName);

  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(bundle, null, 2));

  const shared = await shareFile(file.uri, fileName, 'application/json', 'Save your HerdCare technical backup');
  await updateSettings({ lastBackupAt: new Date().toISOString() });
  return { fileName, uri: file.uri, counts: bundle.counts, shared };
}

export class BackupFormatError extends Error {}

function parseBundle(raw: string): BackupBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BackupFormatError('That file is not a HerdCare backup.');
  }

  const bundle = parsed as Partial<BackupBundle>;
  if (bundle?.format !== BACKUP_FORMAT) {
    throw new BackupFormatError('That file is not a HerdCare backup.');
  }
  if (typeof bundle.version !== 'number' || bundle.version > BACKUP_VERSION) {
    throw new BackupFormatError('That backup was made by a newer version of HerdCare. Update the app first.');
  }
  if (!bundle.data || !Array.isArray(bundle.data.animals)) {
    throw new BackupFormatError('That backup file looks damaged.');
  }
  return bundle as BackupBundle;
}

export interface RestoreSummary {
  added: Record<string, number>;
  updated: number;
  skipped: number;
  exportedAt: string;
}

const idSet = (rows: { id: string }[]) => new Set(rows.map((row) => row.id));

/**
 * Merges a backup into the local database.
 *
 * Merge, never replace: restoring an older backup must not destroy records made since. Animals
 * carry `updatedAt` so the newer copy wins; logged events are immutable in this app, so an id we
 * already hold is simply left alone. This is also the shape the future sync backend will need.
 */
export async function restoreBackup(bundle: BackupBundle): Promise<RestoreSummary> {
  const summary: RestoreSummary = {
    added: { animals: 0, breedingEvents: 0, birthRecords: 0, healthLogs: 0, reminderSchedules: 0 },
    updated: 0,
    skipped: 0,
    exportedAt: bundle.exportedAt,
  };

  // Animals first: the event tables reference them.
  const knownAnimals = idSet(await db.select({ id: animals.id }).from(animals));
  for (const animal of bundle.data.animals) {
    if (!animal?.id) continue;
    if (knownAnimals.has(animal.id)) {
      const [current] = await db.select().from(animals).where(inArray(animals.id, [animal.id]));
      if (current && animal.updatedAt > current.updatedAt) {
        await db.update(animals).set(animal).where(inArray(animals.id, [animal.id]));
        summary.updated++;
      } else {
        summary.skipped++;
      }
      continue;
    }
    await db.insert(animals).values(animal);
    knownAnimals.add(animal.id);
    summary.added.animals++;
  }

  /**
   * Shared guard for the event tables. Foreign keys are not enforced at the SQLite level, so an
   * event whose animal is missing would become an invisible orphan — drop it rather than store
   * something unreachable.
   */
  function acceptable(id: string | undefined, ownerId: string | null | undefined, known: Set<string>): boolean {
    if (!id || known.has(id) || !ownerId || !knownAnimals.has(ownerId)) {
      summary.skipped++;
      return false;
    }
    return true;
  }

  const knownBreeding = idSet(await db.select({ id: breedingEvents.id }).from(breedingEvents));
  for (const row of bundle.data.breedingEvents ?? []) {
    if (!acceptable(row?.id, row?.animalId, knownBreeding)) continue;
    await db.insert(breedingEvents).values(row);
    knownBreeding.add(row.id);
    summary.added.breedingEvents++;
  }

  const knownBirths = idSet(await db.select({ id: birthRecords.id }).from(birthRecords));
  for (const row of bundle.data.birthRecords ?? []) {
    if (!acceptable(row?.id, row?.motherId, knownBirths)) continue;
    await db.insert(birthRecords).values(row);
    knownBirths.add(row.id);
    summary.added.birthRecords++;
  }

  const knownHealth = idSet(await db.select({ id: healthLogs.id }).from(healthLogs));
  for (const row of bundle.data.healthLogs ?? []) {
    if (!acceptable(row?.id, row?.animalId, knownHealth)) continue;
    await db.insert(healthLogs).values(row);
    knownHealth.add(row.id);
    summary.added.healthLogs++;
  }

  const knownSchedules = idSet(await db.select({ id: reminderSchedules.id }).from(reminderSchedules));
  for (const schedule of bundle.data.reminderSchedules ?? []) {
    if (!schedule?.id || knownSchedules.has(schedule.id)) {
      summary.skipped++;
      continue;
    }
    await db.insert(reminderSchedules).values(schedule);
    summary.added.reminderSchedules++;
  }

  return summary;
}

export interface PickedBackup {
  bundle: BackupBundle;
  fileName: string;
}

/** Opens the system file picker and parses the chosen backup. Returns null if the farmer cancels. */
export async function pickBackupFile(): Promise<PickedBackup | null> {
  const result = await DocumentPicker.getDocumentAsync({
    // Some file providers report a JSON backup as octet-stream, so the filter stays wide and the
    // real check happens when the contents are parsed.
    type: ['application/json', 'text/plain', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  const file = new File(asset.uri);
  return { bundle: parseBundle(file.textSync()), fileName: asset.name ?? 'backup.json' };
}
