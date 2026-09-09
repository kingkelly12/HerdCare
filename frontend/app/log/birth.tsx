import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { eq } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Callout } from '@/components/ui/Callout';
import { SelectGroup } from '@/components/ui/SelectGroup';
import { TextField } from '@/components/ui/TextField';
import { QuickDateSelector } from '@/components/ui/QuickDateSelector';
import { Button } from '@/components/ui/Button';
import { AnimalSearchModal } from '@/components/animals/AnimalSearchModal';
import { SelectedAnimalField } from '@/components/animals/SelectedAnimalField';
import { db } from '@/db/client';
import { animals, birthRecords, DELIVERY_TYPES, type Animal, type DeliveryType } from '@/db/schema';
import { calculateWeaningDueDate, formatDateForDisplay, getRelativeDateIso } from '@/utils/livestockRules';
import { notifySaved } from '@/lib/haptics';
import { refreshRemindersAndNotifications } from '@/lib/reminderSync';

const DELIVERY_OPTIONS = DELIVERY_TYPES.map((type) => ({ value: type, label: type }));

export default function LogBirthScreen() {
  const params = useLocalSearchParams<{ animalId?: string }>();
  const [mother, setMother] = useState<Animal | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [birthDate, setBirthDate] = useState(getRelativeDateIso(0));
  const [liveBirths, setLiveBirths] = useState('1');
  const [stillbirths, setStillbirths] = useState('0');
  const [birthWeightAvg, setBirthWeightAvg] = useState('');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('normal');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: preselected } = useLiveQuery(
    db.select().from(animals).where(eq(animals.id, params.animalId ?? '')),
  );
  const selectedMother = mother ?? (params.animalId ? preselected?.[0] ?? null : null);

  const liveBirthsNumber = Number.parseInt(liveBirths, 10) || 0;
  const stillbirthsNumber = Number.parseInt(stillbirths, 10) || 0;
  const totalOffspring = liveBirthsNumber + stillbirthsNumber;

  const weaningDueDate = useMemo(
    () => (selectedMother ? calculateWeaningDueDate(selectedMother.species, birthDate) : null),
    [selectedMother, birthDate],
  );

  const canSave = selectedMother !== null;

  async function handleSave() {
    if (!canSave || !selectedMother) return;
    setSaving(true);
    setError(null);
    try {
      await db.insert(birthRecords).values({
        motherId: selectedMother.id,
        birthDate,
        totalOffspring,
        liveBirths: liveBirthsNumber,
        stillbirths: stillbirthsNumber,
        birthWeightAvg: birthWeightAvg.trim() ? Number.parseFloat(birthWeightAvg) : null,
        deliveryType,
        weaningDueDate,
        notes: notes.trim() || null,
      });
      notifySaved();
      // A birth retires the due-date reminder and opens the weaning one.
      await refreshRemindersAndNotifications();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this birth record.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer footer={<Button label="Save birth record" fullWidth loading={saving} disabled={!canSave} onPress={handleSave} />}>
      <SelectedAnimalField label="Mother" animal={selectedMother} onPress={() => setPickerOpen(true)} required />

      <QuickDateSelector label="Birth date" valueIso={birthDate} onChange={setBirthDate} />

      <View className="flex-row gap-3">
        <View className="flex-1">
          <TextField label="Live births" value={liveBirths} onChangeText={setLiveBirths} keyboardType="number-pad" />
        </View>
        <View className="flex-1">
          <TextField label="Stillbirths" value={stillbirths} onChangeText={setStillbirths} keyboardType="number-pad" />
        </View>
      </View>
      <Text className="-mt-2 text-label text-tertiary">Total offspring: {totalOffspring}</Text>

      <TextField
        label="Average birth weight (kg)"
        value={birthWeightAvg}
        onChangeText={setBirthWeightAvg}
        keyboardType="decimal-pad"
        placeholder="Optional"
      />

      <SelectGroup label="Delivery type" options={DELIVERY_OPTIONS} value={deliveryType} onChange={setDeliveryType} columns={3} />

      {weaningDueDate ? <Callout>{`Weaning due ${formatDateForDisplay(weaningDueDate)}`}</Callout> : null}

      <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline numberOfLines={3} />

      {error ? <Text className="text-callout text-danger">{error}</Text> : null}

      <AnimalSearchModal
        visible={pickerOpen}
        title="Select mother"
        genderFilter="female"
        onSelect={setMother}
        onClose={() => setPickerOpen(false)}
      />
    </ScreenContainer>
  );
}
