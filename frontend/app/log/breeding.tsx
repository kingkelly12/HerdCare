import { useMemo, useState } from 'react';
import { Text } from 'react-native';
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
import { animals, BREEDING_EVENT_TYPES, breedingEvents, type Animal, type BreedingEventType } from '@/db/schema';
import { calculateExpectedDueDate, formatDateForDisplay, getRelativeDateIso } from '@/utils/livestockRules';
import { notifySaved } from '@/lib/haptics';
import { refreshRemindersAndNotifications } from '@/lib/reminderSync';

const EVENT_TYPE_OPTIONS = BREEDING_EVENT_TYPES.map((type) => ({ value: type, label: type.replace(/_/g, ' ') }));
const DUE_DATE_EVENT_TYPES: BreedingEventType[] = ['served_natural', 'served_ai', 'induced'];

export default function LogBreedingScreen() {
  const params = useLocalSearchParams<{ animalId?: string }>();
  const [animal, setAnimal] = useState<Animal | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [eventType, setEventType] = useState<BreedingEventType | null>(null);
  const [eventDate, setEventDate] = useState(getRelativeDateIso(0));
  const [sireCode, setSireCode] = useState('');
  const [technician, setTechnician] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: preselected } = useLiveQuery(
    db.select().from(animals).where(eq(animals.id, params.animalId ?? '')),
  );
  const selectedAnimal = animal ?? (params.animalId ? preselected?.[0] ?? null : null);

  const expectedDueDate = useMemo(() => {
    if (!selectedAnimal || !eventType || !DUE_DATE_EVENT_TYPES.includes(eventType)) return null;
    return calculateExpectedDueDate(selectedAnimal.species, eventDate);
  }, [selectedAnimal, eventType, eventDate]);

  const canSave = selectedAnimal !== null && eventType !== null;

  async function handleSave() {
    if (!canSave || !selectedAnimal || !eventType) return;
    setSaving(true);
    setError(null);
    try {
      await db.insert(breedingEvents).values({
        animalId: selectedAnimal.id,
        eventType,
        eventDate,
        sireIdOrCode: sireCode.trim() || null,
        technicianName: technician.trim() || null,
        expectedDueDate,
        notes: notes.trim() || null,
      });
      notifySaved();
      // A service sets up a heat-return watch and a due date; other events may retire them.
      await refreshRemindersAndNotifications();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this event.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer footer={<Button label="Save event" fullWidth loading={saving} disabled={!canSave} onPress={handleSave} />}>
      <SelectedAnimalField label="Animal" animal={selectedAnimal} onPress={() => setPickerOpen(true)} required />

      <SelectGroup label="Event type" required options={EVENT_TYPE_OPTIONS} value={eventType} onChange={setEventType} />

      <QuickDateSelector label="Event date" valueIso={eventDate} onChange={setEventDate} />

      {expectedDueDate ? <Callout>{`Expected due ${formatDateForDisplay(expectedDueDate)}`}</Callout> : null}

      <TextField label="Sire (ID or code)" value={sireCode} onChangeText={setSireCode} placeholder="Optional" />
      <TextField label="Technician" value={technician} onChangeText={setTechnician} placeholder="Optional" />
      <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline numberOfLines={3} />

      {error ? <Text className="text-callout text-danger">{error}</Text> : null}

      <AnimalSearchModal
        visible={pickerOpen}
        title="Select animal"
        genderFilter="female"
        onSelect={setAnimal}
        onClose={() => setPickerOpen(false)}
      />
    </ScreenContainer>
  );
}
