import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { SelectGroup } from '@/components/ui/SelectGroup';
import { TextField } from '@/components/ui/TextField';
import { QuickDateSelector } from '@/components/ui/QuickDateSelector';
import { Callout } from '@/components/ui/Callout';
import { Button } from '@/components/ui/Button';
import { db } from '@/db/client';
import { flocks, type FlockSource, type PoultryType } from '@/db/schema';
import { getRelativeDateIso } from '@/utils/livestockRules';
import {
  FLOCK_SOURCE_META,
  FLOCK_SOURCE_OPTIONS,
  POULTRY_TYPE_META,
  POULTRY_TYPE_OPTIONS,
  formatFlockAge,
} from '@/utils/poultryRules';
import { notifySaved } from '@/lib/haptics';

export default function NewFlockScreen() {
  const [name, setName] = useState('');
  const [poultryType, setPoultryType] = useState<PoultryType | null>(null);
  const [breed, setBreed] = useState('');
  const [source, setSource] = useState<FlockSource | null>(null);
  const [acquiredDate, setAcquiredDate] = useState(getRelativeDateIso(0));
  const [initialCount, setInitialCount] = useState('');
  const [ageAtAcquisition, setAgeAtAcquisition] = useState('0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Choosing how the flock started fills in how old the birds already were, which the farmer can
  // then correct — a point-of-lay batch is roughly 18 weeks, but suppliers differ.
  function handleSource(next: FlockSource) {
    setSource(next);
    setAgeAtAcquisition(String(FLOCK_SOURCE_META[next].defaultAgeDays));
    if (!name.trim() && poultryType) setName(`${POULTRY_TYPE_META[poultryType].label} batch`);
  }

  const countNumber = Number.parseInt(initialCount, 10);
  const validCount = Number.isFinite(countNumber) && countNumber > 0;
  const ageNumber = Number.parseInt(ageAtAcquisition, 10) || 0;
  const canSave = name.trim().length > 0 && poultryType !== null && source !== null && validCount;

  async function handleSave() {
    if (!canSave || !poultryType || !source) return;
    setSaving(true);
    setError(null);
    try {
      const [created] = await db
        .insert(flocks)
        .values({
          name: name.trim(),
          poultryType,
          breed: breed.trim() || null,
          source,
          acquiredDate,
          ageAtAcquisitionDays: Math.max(0, ageNumber),
          initialCount: countNumber,
        })
        .returning();
      notifySaved();
      router.replace(`/flock/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this flock.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer footer={<Button label="Save flock" fullWidth loading={saving} disabled={!canSave} onPress={handleSave} />}>
      <SelectGroup label="What are they kept for" required options={POULTRY_TYPE_OPTIONS} value={poultryType} onChange={setPoultryType} />
      {poultryType ? <Text className="-mt-1 text-label text-tertiary">{POULTRY_TYPE_META[poultryType].description}</Text> : null}

      <TextField label="Name this batch" required value={name} onChangeText={setName} placeholder="e.g. March layers" />

      <TextField label="Breed" value={breed} onChangeText={setBreed} placeholder="e.g. Kuroiler, ISA Brown, Cobb 500" />

      <TextField
        label="How many birds"
        required
        value={initialCount}
        onChangeText={setInitialCount}
        keyboardType="number-pad"
        placeholder="e.g. 200"
      />

      <SelectGroup label="How did you start them" required options={FLOCK_SOURCE_OPTIONS} value={source} onChange={handleSource} />

      <QuickDateSelector label="When did they arrive" valueIso={acquiredDate} onChange={setAcquiredDate} />

      <TextField
        label="Age on arrival (days)"
        value={ageAtAcquisition}
        onChangeText={setAgeAtAcquisition}
        keyboardType="number-pad"
        hint="Day-old chicks are 0. Point-of-lay pullets are usually about 126 days."
      />

      {canSave ? (
        <Callout>{`${countNumber} birds · ${formatFlockAge(ageNumber)} on arrival`}</Callout>
      ) : null}

      {error ? <Text className="text-callout text-danger">{error}</Text> : null}
    </ScreenContainer>
  );
}
