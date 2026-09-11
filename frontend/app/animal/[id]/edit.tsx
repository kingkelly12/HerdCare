import { useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { eq } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { TextField } from '@/components/ui/TextField';
import { SelectGroup } from '@/components/ui/SelectGroup';
import { QuickDateSelector } from '@/components/ui/QuickDateSelector';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { AnimalSearchModal } from '@/components/animals/AnimalSearchModal';
import { SelectedAnimalField } from '@/components/animals/SelectedAnimalField';
import { SpeciesIcon } from '@/components/animals/SpeciesIcon';
import { db } from '@/db/client';
import { deleteAnimalCascade, findTagClash } from '@/db/queries';
import { animals, SPECIES, type Animal, type Gender, type Species } from '@/db/schema';
import { SPECIES_RULES } from '@/utils/livestockRules';
import { notifySaved } from '@/lib/haptics';
import { refreshRemindersAndNotifications } from '@/lib/reminderSync';

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

const SPECIES_OPTIONS = SPECIES.map((species) => ({
  value: species,
  label: SPECIES_RULES[species].label,
  icon: <SpeciesIcon species={species} size={20} />,
}));

export default function EditAnimalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: rows, updatedAt } = useLiveQuery(db.select().from(animals).where(eq(animals.id, id)));
  const animal = rows?.[0];

  const [loaded, setLoaded] = useState(false);
  const [tagNumber, setTagNumber] = useState('');
  const [name, setName] = useState('');
  const [species, setSpecies] = useState<Species | null>(null);
  const [breed, setBreed] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [birthDate, setBirthDate] = useState('');
  const [dam, setDam] = useState<Animal | null>(null);
  const [sire, setSire] = useState<Animal | null>(null);
  const [pickerOpen, setPickerOpen] = useState<'dam' | 'sire' | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The record loads asynchronously — this seeds the form from it exactly once, rather than on
  // every live-query refresh, so a farmer's in-progress edits are never clobbered by their own save.
  //
  // The parents are resolved with a plain read rather than useLiveQuery on purpose. That hook
  // subscribes inside a useEffect keyed on its dependency array, so a lookup by `animal.damId`
  // would capture the query built on the first render — before `animal` exists — and resolve to
  // nothing forever. Seeding the form from that empty result then wrote `damId: null` back on
  // save, silently erasing a parent the farmer had already recorded. A form is a snapshot
  // anyway, so a one-shot read is both correct and simpler.
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current || !animal) return;
    seededRef.current = true;

    setTagNumber(animal.tagNumber);
    setName(animal.name ?? '');
    setSpecies(animal.species);
    setBreed(animal.breed ?? '');
    setGender(animal.gender);
    setBirthDate(animal.birthDate ?? '');

    let cancelled = false;
    (async () => {
      try {
        const [damRow] = animal.damId ? await db.select().from(animals).where(eq(animals.id, animal.damId)) : [];
        const [sireRow] = animal.sireId ? await db.select().from(animals).where(eq(animals.id, animal.sireId)) : [];
        if (cancelled) return;
        setDam(damRow ?? null);
        setSire(sireRow ?? null);
      } finally {
        // Latched even if the lookup failed, so a broken read cannot leave Save disabled forever.
        // handleSave falls back to the stored ids, so nothing is lost in that case.
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [animal]);

  const canSave = loaded && tagNumber.trim().length > 0 && species !== null && gender !== null;

  async function handleSave() {
    if (!canSave || !species || !gender) return;
    setSaving(true);
    setError(null);
    try {
      const clash = await findTagClash(tagNumber, id);
      if (clash) {
        setError(`Tag ${clash.tagNumber} is already used by ${clash.name ?? 'another animal'}. Tags must be unique.`);
        return;
      }
      await db
        .update(animals)
        .set({
          tagNumber: tagNumber.trim(),
          name: name.trim() || null,
          species,
          breed: breed.trim() || null,
          gender,
          birthDate: birthDate || null,
          // Falls back to what is already stored rather than writing null. The picker can only
          // ever *select* an animal — there is no way to clear a parent from this form — so a
          // null here would only ever mean "not seeded yet", never "the farmer removed it".
          damId: dam?.id ?? animal.damId ?? null,
          sireId: sire?.id ?? animal.sireId ?? null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(animals.id, id));
      notifySaved();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save these changes.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!animal) return;
    Alert.alert(
      `Delete ${animal.tagNumber}?`,
      'This removes the animal and every breeding, health, birth and milk record kept for it. This cannot be undone.\n\nIf the animal was sold or has died, set its status instead — that keeps the history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAnimalCascade(id);
              refreshRemindersAndNotifications().catch(() => {});
              // Back past the detail screen of an animal that no longer exists.
              router.dismissAll();
              router.replace('/animals');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not delete this animal.');
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

  if (!animal) {
    return (
      <ScreenContainer>
        <EmptyState icon="paw-outline" title="Animal not found" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer footer={<Button label="Save changes" fullWidth loading={saving} disabled={!canSave} onPress={handleSave} />}>
      <TextField
        label="Tag number"
        required
        value={tagNumber}
        onChangeText={setTagNumber}
        placeholder="e.g. 042"
        autoCapitalize="characters"
      />
      <TextField label="Name" value={name} onChangeText={setName} placeholder="Optional" />

      <SelectGroup label="Species" required options={SPECIES_OPTIONS} value={species} onChange={setSpecies} />
      <SelectGroup label="Sex" required options={GENDER_OPTIONS} value={gender} onChange={setGender} />

      <TextField label="Breed" value={breed} onChangeText={setBreed} placeholder="Optional" />

      <QuickDateSelector label="Birth date" valueIso={birthDate} onChange={setBirthDate} allowUnknown />

      <SelectedAnimalField label="Mother" animal={dam} onPress={() => setPickerOpen('dam')} />
      <SelectedAnimalField label="Father" animal={sire} onPress={() => setPickerOpen('sire')} />

      {error ? <Text className="text-callout text-danger">{error}</Text> : null}

      <View className="mt-4 gap-2 border-t border-line pt-5">
        <Text className="text-label font-sans-semibold uppercase text-tertiary">Danger zone</Text>
        <Text className="text-label text-tertiary">
          Sold or died? Set the status on the animal instead — deleting throws the history away.
        </Text>
        <Button label="Delete this animal" variant="danger" fullWidth loading={deleting} onPress={confirmDelete} />
      </View>

      <AnimalSearchModal
        visible={pickerOpen === 'dam'}
        title="Select mother"
        genderFilter="female"
        excludeId={id}
        onSelect={setDam}
        onClose={() => setPickerOpen(null)}
      />
      <AnimalSearchModal
        visible={pickerOpen === 'sire'}
        title="Select father"
        genderFilter="male"
        excludeId={id}
        onSelect={setSire}
        onClose={() => setPickerOpen(null)}
      />
    </ScreenContainer>
  );
}
