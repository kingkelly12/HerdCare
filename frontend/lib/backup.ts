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
  customerPayments,
  customers,
  deliveries,
  expenses,
  eggRecords,
  flockEvents,
  flocks,
  hatchBatches,
  healthLogs,
  incomeEntries,
  milkRecords,
  reminderSchedules,
  settings,
  supplierPayments,
  suppliers,
  type Animal,
  type BirthRecord,
  type BreedingEvent,
  type Customer,
  type CustomerPayment,
  type Delivery,
  type Expense,
  type EggRecord,
  type Flock,
  type FlockEvent,
  type HatchBatch,
  type HealthLog,
  type IncomeEntry,
  type MilkRecord,
  type ReminderSchedule,
  type Supplier,
  type SupplierPayment,
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
    milkRecords: MilkRecord[];
    expenses: Expense[];
    incomeEntries: IncomeEntry[];
    flocks: Flock[];
    flockEvents: FlockEvent[];
    eggRecords: EggRecord[];
    hatchBatches: HatchBatch[];
    suppliers: Supplier[];
    supplierPayments: SupplierPayment[];
    customers: Customer[];
    deliveries: Delivery[];
    customerPayments: CustomerPayment[];
    reminderSchedules: ReminderSchedule[];
    settings: Record<string, unknown>[];
  };
}

function dateStamp(date = new Date()): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
}

export async function buildBackup(): Promise<BackupBundle> {
  const [
    animalRows,
    breedingRows,
    birthRows,
    healthRows,
    milkRows,
    expenseRows,
    incomeRows,
    flockRows,
    flockEventRows,
    eggRows,
    hatchRows,
    supplierRows,
    supplierPaymentRows,
    customerRows,
    deliveryRows,
    paymentRows,
    scheduleRows,
    settingsRows,
  ] = await Promise.all([
    db.select().from(animals),
    db.select().from(breedingEvents),
    db.select().from(birthRecords),
    db.select().from(healthLogs),
    db.select().from(milkRecords),
    db.select().from(expenses),
    db.select().from(incomeEntries),
    db.select().from(flocks),
    db.select().from(flockEvents),
    db.select().from(eggRecords),
    db.select().from(hatchBatches),
    db.select().from(suppliers),
    db.select().from(supplierPayments),
    db.select().from(customers),
    db.select().from(deliveries),
    db.select().from(customerPayments),
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
      milkRecords: milkRows.length,
      expenses: expenseRows.length,
      incomeEntries: incomeRows.length,
      flocks: flockRows.length,
      flockEvents: flockEventRows.length,
      eggRecords: eggRows.length,
      hatchBatches: hatchRows.length,
      suppliers: supplierRows.length,
      supplierPayments: supplierPaymentRows.length,
      customers: customerRows.length,
      deliveries: deliveryRows.length,
      customerPayments: paymentRows.length,
      reminderSchedules: scheduleRows.length,
    },
    data: {
      animals: animalRows,
      breedingEvents: breedingRows,
      birthRecords: birthRows,
      healthLogs: healthRows,
      milkRecords: milkRows,
      expenses: expenseRows,
      incomeEntries: incomeRows,
      flocks: flockRows,
      flockEvents: flockEventRows,
      eggRecords: eggRows,
      hatchBatches: hatchRows,
      suppliers: supplierRows,
      supplierPayments: supplierPaymentRows,
      customers: customerRows,
      deliveries: deliveryRows,
      customerPayments: paymentRows,
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
    added: {
      animals: 0,
      breedingEvents: 0,
      birthRecords: 0,
      healthLogs: 0,
      milkRecords: 0,
      expenses: 0,
      incomeEntries: 0,
      flocks: 0,
      flockEvents: 0,
      eggRecords: 0,
      hatchBatches: 0,
      suppliers: 0,
      supplierPayments: 0,
      customers: 0,
      deliveries: 0,
      customerPayments: 0,
      reminderSchedules: 0,
    },
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

  const knownMilk = idSet(await db.select({ id: milkRecords.id }).from(milkRecords));
  for (const row of bundle.data.milkRecords ?? []) {
    if (!acceptable(row?.id, row?.animalId, knownMilk)) continue;
    await db.insert(milkRecords).values(row);
    knownMilk.add(row.id);
    summary.added.milkRecords = (summary.added.milkRecords ?? 0) + 1;
  }

  // Money is restored even when the animal it referenced is gone — the transaction still happened,
  // so the link is dropped rather than the record. Losing it would understate the farmer's books.
  const knownSuppliers = idSet(await db.select({ id: suppliers.id }).from(suppliers));
  for (const row of bundle.data.suppliers ?? []) {
    if (!row?.id || knownSuppliers.has(row.id)) {
      summary.skipped++;
      continue;
    }
    await db.insert(suppliers).values(row);
    knownSuppliers.add(row.id);
    summary.added.suppliers = (summary.added.suppliers ?? 0) + 1;
  }

  const knownSupplierPayments = idSet(await db.select({ id: supplierPayments.id }).from(supplierPayments));
  for (const row of bundle.data.supplierPayments ?? []) {
    if (!row?.id || knownSupplierPayments.has(row.id) || !row.supplierId || !knownSuppliers.has(row.supplierId)) {
      summary.skipped++;
      continue;
    }
    await db.insert(supplierPayments).values(row);
    knownSupplierPayments.add(row.id);
    summary.added.supplierPayments = (summary.added.supplierPayments ?? 0) + 1;
  }

  const knownExpenses = idSet(await db.select({ id: expenses.id }).from(expenses));
  for (const row of bundle.data.expenses ?? []) {
    if (!row?.id || knownExpenses.has(row.id)) {
      summary.skipped++;
      continue;
    }
    await db.insert(expenses).values({
      ...row,
      animalId: row.animalId && knownAnimals.has(row.animalId) ? row.animalId : null,
      supplierId: row.supplierId && knownSuppliers.has(row.supplierId) ? row.supplierId : null,
    });
    knownExpenses.add(row.id);
    summary.added.expenses = (summary.added.expenses ?? 0) + 1;
  }

  const knownIncome = idSet(await db.select({ id: incomeEntries.id }).from(incomeEntries));
  for (const row of bundle.data.incomeEntries ?? []) {
    if (!row?.id || knownIncome.has(row.id)) {
      summary.skipped++;
      continue;
    }
    await db
      .insert(incomeEntries)
      .values({ ...row, animalId: row.animalId && knownAnimals.has(row.animalId) ? row.animalId : null });
    knownIncome.add(row.id);
    summary.added.incomeEntries = (summary.added.incomeEntries ?? 0) + 1;
  }

  // Flocks stand alone — they reference no animal, so they restore before their own events.
  const knownFlocks = idSet(await db.select({ id: flocks.id }).from(flocks));
  for (const row of bundle.data.flocks ?? []) {
    if (!row?.id || knownFlocks.has(row.id)) {
      summary.skipped++;
      continue;
    }
    await db.insert(flocks).values(row);
    knownFlocks.add(row.id);
    summary.added.flocks = (summary.added.flocks ?? 0) + 1;
  }

  const knownFlockEvents = idSet(await db.select({ id: flockEvents.id }).from(flockEvents));
  for (const row of bundle.data.flockEvents ?? []) {
    // An event whose flock is missing would silently distort that flock's bird count, so it is
    // dropped for the same reason an orphaned animal event is.
    if (!row?.id || knownFlockEvents.has(row.id) || !row.flockId || !knownFlocks.has(row.flockId)) {
      summary.skipped++;
      continue;
    }
    await db.insert(flockEvents).values(row);
    knownFlockEvents.add(row.id);
    summary.added.flockEvents = (summary.added.flockEvents ?? 0) + 1;
  }

  const knownEggs = idSet(await db.select({ id: eggRecords.id }).from(eggRecords));
  for (const row of bundle.data.eggRecords ?? []) {
    // Same orphan rule as flock events: a collection with no flock would count toward nothing.
    if (!row?.id || knownEggs.has(row.id) || !row.flockId || !knownFlocks.has(row.flockId)) {
      summary.skipped++;
      continue;
    }
    await db.insert(eggRecords).values(row);
    knownEggs.add(row.id);
    summary.added.eggRecords = (summary.added.eggRecords ?? 0) + 1;
  }

  const knownHatches = idSet(await db.select({ id: hatchBatches.id }).from(hatchBatches));
  for (const row of bundle.data.hatchBatches ?? []) {
    if (!row?.id || knownHatches.has(row.id)) {
      summary.skipped++;
      continue;
    }
    // Both flock links are optional, so a batch outlives a flock that did not come back.
    await db.insert(hatchBatches).values({
      ...row,
      sourceFlockId: row.sourceFlockId && knownFlocks.has(row.sourceFlockId) ? row.sourceFlockId : null,
      resultingFlockId: row.resultingFlockId && knownFlocks.has(row.resultingFlockId) ? row.resultingFlockId : null,
    });
    knownHatches.add(row.id);
    summary.added.hatchBatches = (summary.added.hatchBatches ?? 0) + 1;
  }

  const knownCustomers = idSet(await db.select({ id: customers.id }).from(customers));
  for (const row of bundle.data.customers ?? []) {
    if (!row?.id || knownCustomers.has(row.id)) {
      summary.skipped++;
      continue;
    }
    await db.insert(customers).values(row);
    knownCustomers.add(row.id);
    summary.added.customers = (summary.added.customers ?? 0) + 1;
  }

  // A delivery or payment with no customer would leave money floating against nobody, which is
  // worse than losing the row — the balance it belongs to could never be reached again.
  const knownDeliveries = idSet(await db.select({ id: deliveries.id }).from(deliveries));
  for (const row of bundle.data.deliveries ?? []) {
    if (!row?.id || knownDeliveries.has(row.id) || !row.customerId || !knownCustomers.has(row.customerId)) {
      summary.skipped++;
      continue;
    }
    await db.insert(deliveries).values(row);
    knownDeliveries.add(row.id);
    summary.added.deliveries = (summary.added.deliveries ?? 0) + 1;
  }

  const knownPayments = idSet(await db.select({ id: customerPayments.id }).from(customerPayments));
  for (const row of bundle.data.customerPayments ?? []) {
    if (!row?.id || knownPayments.has(row.id) || !row.customerId || !knownCustomers.has(row.customerId)) {
      summary.skipped++;
      continue;
    }
    await db.insert(customerPayments).values(row);
    knownPayments.add(row.id);
    summary.added.customerPayments = (summary.added.customerPayments ?? 0) + 1;
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

  // Preferences travel with the backup so a farmer setting up a replacement phone does not have
  // to rebuild them from memory. `lastBackupAt` is deliberately excluded: it describes this
  // device's own backup history, and importing someone else's would make the "your records are
  // not backed up" nudge lie.
  // The `cloud_account` table is absent for the same reason as `licenses` below: it holds this
  // phone's device token, and a backup file carrying one would hand over the farmer's cloud
  // account to whoever they gave the file to.
  //
  // The `licenses` table is deliberately absent from this whole file. A backup is a file a farmer
  // can hand to anyone, and an activation travelling inside one would unlock every phone it
  // reached. Renewal is a code from an agent, not something restored.
  const [incomingSettings] = bundle.data.settings ?? [];
  if (incomingSettings) {
    const { id: _id, lastBackupAt: _lastBackupAt, createdAt: _createdAt, updatedAt: _updatedAt, ...preferences } =
      incomingSettings as Record<string, unknown>;
    if (Object.keys(preferences).length > 0) {
      await updateSettings(preferences as Parameters<typeof updateSettings>[0]);
    }
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
