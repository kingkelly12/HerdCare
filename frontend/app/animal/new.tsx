import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { TextField } from '@/components/ui/TextField';
import { ChipGroup } from '@/components/ui/Chip';
import { QuickDateSelector } from '@/components/ui/QuickDateSelector';
import { Button } from '@/components/ui/Button';
import { AnimalSearchModal } from '@/components/animals/AnimalSearchModal';
import { SelectedAnimalField } from '@/components/animals/SelectedAnimalField';
import { db } from '@/db/client';
import { animals, type Animal, type Gender, type Species } from '@/db/schema';
import { SPECIES_LIST } from '@/utils/livestockRules';
import { notifySaved } from '@/lib/haptics';

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

export default function NewAnimalScreen() {
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

  const canSave = tagNumber.trim().length > 0 && species !== null && gender !== null;

  async function handleSave() {
    if (!canSave || !species || !gender) return;
    setSaving(true);
    setError(null);
    try {
      const [created] = await db
        .insert(animals)
        .values({
          tagNumber: tagNumber.trim(),
          name: name.trim() || null,
          species,
          breed: breed.trim() || null,
          gender,
          birthDate: birthDate || null,
          damId: dam?.id ?? null,
          sireId: sire?.id ?? null,
        })
        .returning();
      notifySaved();
      router.replace(`/animal/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this animal.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer footer={<Button label="Save animal" fullWidth loading={saving} disabled={!canSave} onPress={handleSave} />}>
      <TextField label="Tag number" required value={tagNumber} onChangeText={setTagNumber} placeholder="e.g. 042" autoCapitalize="characters" />
      <TextField label="Name" value={name} onChangeText={setName} placeholder="Optional" />

      <Text className="text-base font-medium text-ink-700">
        Species<Text className="text-danger-500"> *</Text>
      </Text>
      <ChipGroup options={SPECIES_LIST} value={species} onChange={setSpecies} />

      <Text className="text-base font-medium text-ink-700">
        Gender<Text className="text-danger-500"> *</Text>
      </Text>
      <ChipGroup options={GENDER_OPTIONS} value={gender} onChange={setGender} />

      <TextField label="Breed" value={breed} onChangeText={setBreed} placeholder="Optional" />

      <QuickDateSelector label="Birth date" valueIso={birthDate} onChange={setBirthDate} allowUnknown />

      <SelectedAnimalField label="Dam (mother)" animal={dam} onPress={() => setPickerOpen('dam')} />
      <SelectedAnimalField label="Sire (father)" animal={sire} onPress={() => setPickerOpen('sire')} />

      {error ? <Text className="text-base text-danger-500">{error}</Text> : null}

      <AnimalSearchModal
        visible={pickerOpen === 'dam'}
        title="Select dam"
        genderFilter="female"
        onSelect={setDam}
        onClose={() => setPickerOpen(null)}
      />
      <AnimalSearchModal
        visible={pickerOpen === 'sire'}
        title="Select sire"
        genderFilter="male"
        onSelect={setSire}
        onClose={() => setPickerOpen(null)}
      />
    </ScreenContainer>
  );
}
