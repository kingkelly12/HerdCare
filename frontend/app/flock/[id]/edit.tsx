import { useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { eq } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { SelectGroup } from '@/components/ui/SelectGroup';
import { TextField } from '@/components/ui/TextField';
import { QuickDateSelector } from '@/components/ui/QuickDateSelector';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { db } from '@/db/client';
import { deleteFlockCascade } from '@/db/queries';
import { FLOCK_STATUSES, flocks, type FlockSource, type FlockStatus, type PoultryType } from '@/db/schema';
import { FLOCK_SOURCE_OPTIONS, POULTRY_TYPE_OPTIONS } from '@/utils/poultryRules';
import { notifySaved } from '@/lib/haptics';

const STATUS_OPTIONS = FLOCK_STATUSES.map((status) => ({
  value: status,
  label: status === 'active' ? 'Active' : 'Closed',
}));

export default function EditFlockScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: rows, updatedAt } = useLiveQuery(db.select().from(flocks).where(eq(flocks.id, id)), [id]);
  const flock = rows?.[0];

  const seededRef = useRef(false);
  const [name, setName] = useState('');
  const [poultryType, setPoultryType] = useState<PoultryType | null>(null);
  const [breed, setBreed] = useState('');
  const [source, setSource] = useState<FlockSource | null>(null);
  const [acquiredDate, setAcquiredDate] = useState('');
  const [initialCount, setInitialCount] = useState('');
  const [ageAtAcquisition, setAgeAtAcquisition] = useState('0');
  const [status, setStatus] = useState<FlockStatus>('active');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (seededRef.current || !flock) return;
    seededRef.current = true;
    setName(flock.name);
    setPoultryType(flock.poultryType);
    setBreed(flock.breed ?? '');
    setSource(flock.source);
    setAcquiredDate(flock.acquiredDate);
    setInitialCount(String(flock.initialCount));
    setAgeAtAcquisition(String(flock.ageAtAcquisitionDays));
    setStatus(flock.status);
  }, [flock]);

  const countNumber = Number.parseInt(initialCount, 10);
  const validCount = Number.isFinite(countNumber) && countNumber > 0;
  const canSave = name.trim().length > 0 && poultryType !== null && source !== null && validCount;

  async function handleSave() {
    if (!canSave || !poultryType || !source) return;
    setSaving(true);
    setError(null);
    try {
      await db
        .update(flocks)
        .set({
          name: name.trim(),
          poultryType,
          breed: breed.trim() || null,
          source,
          acquiredDate,
          initialCount: countNumber,
          ageAtAcquisitionDays: Math.max(0, Number.parseInt(ageAtAcquisition, 10) || 0),
          status,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(flocks.id, id));
      notifySaved();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save these changes.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!flock) return;
    Alert.alert(
      `Delete ${flock.name}?`,
      'This removes the flock and everything logged against it. This cannot be undone.\n\nIf the batch is finished, set it to Closed instead — that keeps the history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteFlockCascade(id);
              router.dismissAll();
              router.replace('/animals');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not delete this flock.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  // Still resolving — useLiveQuery starts with an empty array, not undefined, so without
  // this check the not-found screen flashes for a frame on every navigation here, including
  // the instant after a new record is saved.
  if (!updatedAt) {
    return <ScreenContainer>{null}</ScreenContainer>;
  }

  if (!flock) {
    return (
      <ScreenContainer>
        <EmptyState icon="egg-outline" title="Flock not found" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer footer={<Button label="Save changes" fullWidth loading={saving} disabled={!canSave} onPress={handleSave} />}>
      <TextField label="Name" required value={name} onChangeText={setName} />
      <SelectGroup label="Kept for" required options={POULTRY_TYPE_OPTIONS} value={poultryType} onChange={setPoultryType} />
      <TextField label="Breed" value={breed} onChangeText={setBreed} placeholder="Optional" />
      <TextField
        label="Birds started with"
        required
        value={initialCount}
        onChangeText={setInitialCount}
        keyboardType="number-pad"
        hint="Deaths and sales are taken off this automatically — correct it only if the original number was wrong."
      />
      <SelectGroup label="Started as" required options={FLOCK_SOURCE_OPTIONS} value={source} onChange={setSource} />
      <QuickDateSelector label="Arrived" valueIso={acquiredDate} onChange={setAcquiredDate} />
      <TextField
        label="Age on arrival (days)"
        value={ageAtAcquisition}
        onChangeText={setAgeAtAcquisition}
        keyboardType="number-pad"
      />
      <SelectGroup label="Status" options={STATUS_OPTIONS} value={status} onChange={setStatus} />

      {error ? <Text className="text-callout text-danger">{error}</Text> : null}

      <View className="mt-4 gap-2 border-t border-line pt-5">
        <Text className="text-label font-sans-semibold uppercase text-tertiary">Danger zone</Text>
        <Text className="text-label text-tertiary">
          Batch finished? Set it to Closed instead — deleting throws the history away.
        </Text>
        <Button label="Delete this flock" variant="danger" fullWidth loading={deleting} onPress={confirmDelete} />
      </View>
    </ScreenContainer>
  );
}
