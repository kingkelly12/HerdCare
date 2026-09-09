import { useEffect, useState } from 'react';
import { Text } from 'react-native';
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
import { animals, SPECIES, type Animal, type Gender, type Species } from '@/db/schema';
import { SPECIES_RULES } from '@/utils/livestockRules';
import { notifySaved } from '@/lib/haptics';

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
  const { data: rows } = useLiveQuery(db.select().from(animals).where(eq(animals.id, id)));
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
  const [error, setError] = useState<string | null>(null);

  // The record loads asynchronously — this seeds the form from it exactly once, rather than on
  // every live-query refresh, so a farmer's in-progress edits are never clobbered by their own save.
  const { data: damRows } = useLiveQuery(db.select().from(animals).where(eq(animals.id, animal?.damId ?? '')));
  const { data: sireRows } = useLiveQuery(db.select().from(animals).where(eq(animals.id, animal?.sireId ?? '')));

  useEffect(() => {
    if (loaded || !animal) return;
    setTagNumber(animal.tagNumber);
    setName(animal.name ?? '');
    setSpecies(animal.species);
    setBreed(animal.breed ?? '');
    setGender(animal.gender);
    setBirthDate(animal.birthDate ?? '');
    setDam(damRows?.[0] ?? null);
    setSire(sireRows?.[0] ?? null);
    setLoaded(true);
  }, [loaded, animal, damRows, sireRows]);

  const canSave = tagNumber.trim().length > 0 && species !== null && gender !== null;

  async function handleSave() {
    if (!canSave || !species || !gender) return;
    setSaving(true);
    setError(null);
    try {
      await db
        .update(animals)
        .set({
          tagNumber: tagNumber.trim(),
          name: name.trim() || null,
          species,
          breed: breed.trim() || null,
          gender,
          birthDate: birthDate || null,
          damId: dam?.id ?? null,
          sireId: sire?.id ?? null,
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

      <SelectedAnimalField label="Dam (mother)" animal={dam} onPress={() => setPickerOpen('dam')} />
      <SelectedAnimalField label="Sire (father)" animal={sire} onPress={() => setPickerOpen('sire')} />

      {error ? <Text className="text-callout text-danger">{error}</Text> : null}

      <AnimalSearchModal
        visible={pickerOpen === 'dam'}
        title="Select dam"
        genderFilter="female"
        excludeId={id}
        onSelect={setDam}
        onClose={() => setPickerOpen(null)}
      />
      <AnimalSearchModal
        visible={pickerOpen === 'sire'}
        title="Select sire"
        genderFilter="male"
        excludeId={id}
        onSelect={setSire}
        onClose={() => setPickerOpen(null)}
      />
    </ScreenContainer>
  );
}
