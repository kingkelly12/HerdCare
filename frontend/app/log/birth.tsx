import { useMemo, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { eq } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface } from '@/components/ui/Surface';
import { Callout } from '@/components/ui/Callout';
import { SelectGroup } from '@/components/ui/SelectGroup';
import { TextField } from '@/components/ui/TextField';
import { QuickDateSelector } from '@/components/ui/QuickDateSelector';
import { Button } from '@/components/ui/Button';
import { AnimalSearchModal } from '@/components/animals/AnimalSearchModal';
import { SelectedAnimalField } from '@/components/animals/SelectedAnimalField';
import { db } from '@/db/client';
import { findTagClash } from '@/db/queries';
import { animals, birthRecords, DELIVERY_TYPES, type Animal, type DeliveryType, type Gender } from '@/db/schema';
import { calculateWeaningDueDate, formatDateForDisplay, getRelativeDateIso } from '@/utils/livestockRules';
import { useColors } from '@/theme/colors';
import { notifySaved } from '@/lib/haptics';
import { refreshRemindersAndNotifications } from '@/lib/reminderSync';

const DELIVERY_OPTIONS = DELIVERY_TYPES.map((type) => ({ value: type, label: type }));
const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

export default function LogBirthScreen() {
  const params = useLocalSearchParams<{ animalId?: string }>();
  const colors = useColors();
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
  // Registering the young as animals in their own right is optional — a farmer mid-calving wants
  // the birth logged in seconds and may not have tagged anything yet. Without this, though, a
  // birth of three calves left the herd list and the mother's Family tab showing nothing.
  const [registerOffspring, setRegisterOffspring] = useState(false);
  const [offspring, setOffspring] = useState<{ tagNumber: string; gender: Gender }[]>([]);

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

  // Keeps one row per live birth as that number is edited, preserving anything already typed.
  function toggleRegisterOffspring(next: boolean) {
    setRegisterOffspring(next);
    if (next) syncOffspringRows(liveBirthsNumber);
  }

  function syncOffspringRows(count: number) {
    setOffspring((previous) =>
      Array.from({ length: Math.max(0, Math.min(count, 20)) }, (_, i) => previous[i] ?? { tagNumber: '', gender: 'female' }),
    );
  }

  function updateOffspring(index: number, patch: Partial<{ tagNumber: string; gender: Gender }>) {
    setOffspring((previous) => previous.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  const canSave = selectedMother !== null;

  async function handleSave() {
    if (!canSave || !selectedMother) return;
    setSaving(true);
    setError(null);
    try {
      // Tags are validated before anything is written, so a clash cannot leave a birth recorded
      // with only some of its offspring registered.
      const newborns = registerOffspring ? offspring.filter((row) => row.tagNumber.trim()) : [];
      const seen = new Set<string>();
      for (const newborn of newborns) {
        const tag = newborn.tagNumber.trim();
        if (seen.has(tag.toLowerCase())) {
          setError(`Tag ${tag} is repeated. Give each offspring its own tag.`);
          return;
        }
        seen.add(tag.toLowerCase());
        const clash = await findTagClash(tag);
        if (clash) {
          setError(`Tag ${clash.tagNumber} is already used by another animal. Tags must be unique.`);
          return;
        }
      }

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

      for (const newborn of newborns) {
        await db.insert(animals).values({
          tagNumber: newborn.tagNumber.trim(),
          species: selectedMother.species,
          gender: newborn.gender,
          birthDate,
          // The lineage link is the whole point — it is what makes the mother's Family tab and
          // the newborn's own record agree that this birth happened.
          damId: selectedMother.id,
          breed: selectedMother.breed,
        });
      }

      notifySaved();
      // Not awaited — see the note in log/breeding.tsx. Rescheduling notifications can block on
      // an OS permission dialog, which must not stall confirmation that the birth was saved.
      refreshRemindersAndNotifications().catch(() => {});
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
          <TextField
            label="Live births"
            value={liveBirths}
            onChangeText={(value) => {
              setLiveBirths(value);
              if (registerOffspring) syncOffspringRows(Number.parseInt(value, 10) || 0);
            }}
            keyboardType="number-pad"
          />
        </View>
        <View className="flex-1">
          <TextField label="Stillbirths" value={stillbirths} onChangeText={setStillbirths} keyboardType="number-pad" />
        </View>
      </View>
      <Text className="-mt-2 text-label text-tertiary">Total offspring: {totalOffspring}</Text>

      {liveBirthsNumber > 0 && selectedMother ? (
        <Surface level="raised" className="gap-3 p-4">
          <View className="flex-row items-center gap-3">
            <View className="flex-1">
              <Text className="text-body font-sans-medium text-primary">Add the young to the herd</Text>
              <Text className="text-label text-tertiary">
                Registers each one as its own animal, linked to {selectedMother.tagNumber} as mother.
              </Text>
            </View>
            <Switch
              value={registerOffspring}
              onValueChange={toggleRegisterOffspring}
              trackColor={{ true: colors.brand, false: colors.borderStrong }}
              thumbColor={colors.raised}
            />
          </View>

          {registerOffspring
            ? offspring.map((row, index) => (
                <View key={index} className="gap-2 border-t border-line pt-3">
                  <TextField
                    label={`Offspring ${index + 1} tag`}
                    value={row.tagNumber}
                    onChangeText={(value) => updateOffspring(index, { tagNumber: value })}
                    placeholder="Leave blank to skip"
                    autoCapitalize="characters"
                  />
                  <SelectGroup
                    label="Sex"
                    options={GENDER_OPTIONS}
                    value={row.gender}
                    onChange={(gender) => updateOffspring(index, { gender })}
                  />
                </View>
              ))
            : null}
        </Surface>
      ) : null}

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
