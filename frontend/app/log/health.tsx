import { useMemo, useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { and, eq } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Callout } from '@/components/ui/Callout';
import { TextField } from '@/components/ui/TextField';
import { QuickDateSelector } from '@/components/ui/QuickDateSelector';
import { Button } from '@/components/ui/Button';
import { AnimalSearchModal } from '@/components/animals/AnimalSearchModal';
import { SelectedAnimalField } from '@/components/animals/SelectedAnimalField';
import { db } from '@/db/client';
import { animals, healthLogs, type Animal } from '@/db/schema';
import { addDaysIso, formatDateForDisplay, getRelativeDateIso, startOfTodayIso } from '@/utils/livestockRules';
import { notifySaved } from '@/lib/haptics';
import { refreshRemindersAndNotifications } from '@/lib/reminderSync';

export default function LogHealthScreen() {
  const params = useLocalSearchParams<{ animalId?: string }>();
  const [animal, setAnimal] = useState<Animal | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [treatmentDate, setTreatmentDate] = useState(getRelativeDateIso(0));
  const [condition, setCondition] = useState('');
  const [medication, setMedication] = useState('');
  const [withdrawalDays, setWithdrawalDays] = useState('0');
  const [administeredBy, setAdministeredBy] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: preselected } = useLiveQuery(
    db.select().from(animals).where(eq(animals.id, params.animalId ?? '')),
  );
  const selectedAnimal = animal ?? (params.animalId ? preselected?.[0] ?? null : null);

  const withdrawalDaysNumber = Number.parseInt(withdrawalDays, 10) || 0;
  const withdrawalEndDate = useMemo(
    () => (withdrawalDaysNumber > 0 ? addDaysIso(treatmentDate, withdrawalDaysNumber) : null),
    [treatmentDate, withdrawalDaysNumber],
  );

  const canSave = selectedAnimal !== null && condition.trim().length > 0;

  async function handleSave() {
    if (!canSave || !selectedAnimal) return;
    setSaving(true);
    setError(null);
    try {
      await db.insert(healthLogs).values({
        animalId: selectedAnimal.id,
        treatmentDate,
        conditionTreated: condition.trim(),
        medicationGiven: medication.trim() || null,
        withdrawalDays: withdrawalDaysNumber,
        withdrawalEndDate,
        administeredBy: administeredBy.trim() || null,
      });
      // Only flag an animal that is otherwise active, and only while the withdrawal is still
      // running — a back-dated treatment whose period has already elapsed must not flag it.
      const withdrawalStillRunning = withdrawalEndDate !== null && withdrawalEndDate >= startOfTodayIso();
      if (withdrawalStillRunning) {
        await db
          .update(animals)
          .set({ status: 'in_withdrawal', updatedAt: new Date().toISOString() })
          .where(and(eq(animals.id, selectedAnimal.id), eq(animals.status, 'active')));
      }
      notifySaved();
      // Not awaited — see the note in log/breeding.tsx. Rescheduling notifications can block on
      // an OS permission dialog, which must not stall confirmation that the treatment was saved.
      refreshRemindersAndNotifications().catch(() => {});
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this treatment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer footer={<Button label="Save treatment" fullWidth loading={saving} disabled={!canSave} onPress={handleSave} />}>
      <SelectedAnimalField label="Animal" animal={selectedAnimal} onPress={() => setPickerOpen(true)} required />

      <QuickDateSelector label="Treatment date" valueIso={treatmentDate} onChange={setTreatmentDate} />

      <TextField label="Condition treated" required value={condition} onChangeText={setCondition} placeholder="e.g. Mastitis" />
      <TextField label="Medication given" value={medication} onChangeText={setMedication} placeholder="Optional" />
      <TextField
        label="Withdrawal period (days)"
        value={withdrawalDays}
        onChangeText={setWithdrawalDays}
        keyboardType="number-pad"
      />

      {withdrawalEndDate ? (
        <Callout tone="warn">{`Do not sell milk or meat until ${formatDateForDisplay(withdrawalEndDate)}`}</Callout>
      ) : null}

      <TextField label="Administered by" value={administeredBy} onChangeText={setAdministeredBy} placeholder="Optional" />

      {error ? <Text className="text-callout text-danger">{error}</Text> : null}

      <AnimalSearchModal visible={pickerOpen} title="Select animal" onSelect={setAnimal} onClose={() => setPickerOpen(false)} />
    </ScreenContainer>
  );
}
