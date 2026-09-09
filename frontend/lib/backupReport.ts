import type { BackupBundle } from './backup';
import { formatDateForDisplay } from '@/utils/livestockRules';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function speciesLabel(species: string): string {
  return species.charAt(0).toUpperCase() + species.slice(1);
}

/**
 * Renders a backup bundle as a printable HTML report — the human-readable counterpart to the
 * JSON backup. A farmer, a vet or a buyer can read this without the app; it deliberately does
 * not attempt to be machine-parseable back into the database, which is what the JSON export
 * (Settings → Save technical backup) is for.
 */
export function buildBackupReportHtml(bundle: BackupBundle): string {
  const { animals, breedingEvents, birthRecords, healthLogs } = bundle.data;

  const animalsById = new Map(animals.map((a) => [a.id, a]));
  const sortedAnimals = [...animals].sort((a, b) => a.tagNumber.localeCompare(b.tagNumber));

  const rows = sortedAnimals
    .map((animal) => {
      const events = [
        ...breedingEvents
          .filter((e) => e.animalId === animal.id)
          .map((e) => ({
            date: e.eventDate,
            text: `${e.eventType.replace(/_/g, ' ')}${e.expectedDueDate ? ` · due ${formatDateForDisplay(e.expectedDueDate)}` : ''}`,
          })),
        ...healthLogs
          .filter((h) => h.animalId === animal.id)
          .map((h) => ({
            date: h.treatmentDate,
            text: `Treated for ${h.conditionTreated}${h.medicationGiven ? ` (${h.medicationGiven})` : ''}${
              h.withdrawalEndDate ? ` · withdrawal until ${formatDateForDisplay(h.withdrawalEndDate)}` : ''
            }`,
          })),
        ...birthRecords
          .filter((b) => b.motherId === animal.id)
          .map((b) => ({
            date: b.birthDate,
            text: `Birth · ${b.liveBirths} live, ${b.stillbirths} stillborn (${b.deliveryType})`,
          })),
      ].sort((a, b) => (a.date < b.date ? 1 : -1));

      const eventRows = events.length
        ? events
            .map(
              (e) =>
                `<tr><td class="date">${escapeHtml(formatDateForDisplay(e.date))}</td><td>${escapeHtml(e.text)}</td></tr>`,
            )
            .join('')
        : '<tr><td colspan="2" class="muted">No events logged</td></tr>';

      const dam = animal.damId ? animalsById.get(animal.damId) : null;
      const sire = animal.sireId ? animalsById.get(animal.sireId) : null;
      const lineage = [dam ? `Dam: ${dam.tagNumber}` : null, sire ? `Sire: ${sire.tagNumber}` : null]
        .filter(Boolean)
        .join(' · ');

      return `
        <section class="animal">
          <h2>${escapeHtml(animal.tagNumber)}${animal.name ? ` — ${escapeHtml(animal.name)}` : ''}</h2>
          <p class="meta">
            ${escapeHtml(speciesLabel(animal.species))} · ${escapeHtml(animal.breed || 'Unknown breed')} ·
            ${escapeHtml(animal.gender)} · Born ${escapeHtml(formatDateForDisplay(animal.birthDate))} ·
            Status: ${escapeHtml(animal.status.replace('_', ' '))}
            ${lineage ? `<br/>${escapeHtml(lineage)}` : ''}
          </p>
          <table>${eventRows}</table>
        </section>`;
    })
    .join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1C1A16; padding: 24px; }
          h1 { font-size: 22px; margin-bottom: 2px; }
          .subtitle { color: #5C564A; font-size: 13px; margin-bottom: 24px; }
          .summary { display: flex; gap: 24px; margin-bottom: 28px; }
          .summary div { font-size: 13px; color: #5C564A; }
          .summary strong { display: block; font-size: 20px; color: #1C1A16; }
          .animal { margin-bottom: 22px; page-break-inside: avoid; }
          .animal h2 { font-size: 16px; margin: 0 0 2px 0; border-top: 1px solid #E2DBCF; padding-top: 14px; }
          .meta { font-size: 12px; color: #5C564A; margin: 0 0 8px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          td { padding: 3px 0; vertical-align: top; }
          td.date { width: 110px; color: #5C564A; white-space: nowrap; }
          td.muted { color: #8C8476; font-style: italic; }
          .empty { color: #8C8476; font-style: italic; padding: 40px 0; text-align: center; }
        </style>
      </head>
      <body>
        <h1>HerdCare Records</h1>
        <p class="subtitle">Exported ${escapeHtml(formatDateForDisplay(bundle.exportedAt))}</p>
        <div class="summary">
          <div><strong>${animals.length}</strong>Animals</div>
          <div><strong>${breedingEvents.length}</strong>Breeding events</div>
          <div><strong>${healthLogs.length}</strong>Health logs</div>
          <div><strong>${birthRecords.length}</strong>Birth records</div>
        </div>
        ${sortedAnimals.length ? rows : '<p class="empty">No animals recorded yet.</p>'}
      </body>
    </html>`;
}
