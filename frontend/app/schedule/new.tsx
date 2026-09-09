import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Callout } from '@/components/ui/Callout';
import { TextField } from '@/components/ui/TextField';
import { SelectGroup } from '@/components/ui/SelectGroup';
import { QuickDateSelector } from '@/components/ui/QuickDateSelector';
import { Button } from '@/components/ui/Button';
import { db } from '@/db/client';
import { reminderSchedules, type RoutineCategory, type Species } from '@/db/schema';
import { formatDateForDisplay, getRelativeDateIso, SPECIES_LIST } from '@/utils/livestockRules';
import { INTERVAL_PRESETS, ROUTINE_CATEGORY_LIST, ROUTINE_CATEGORY_META } from '@/utils/reminderRules';
import { refreshRemindersAndNotifications } from '@/lib/reminderSync';
import { notifySaved } from '@/lib/haptics';

const SPECIES_OPTIONS = [{ value: 'all' as const, label: 'All animals' }, ...SPECIES_LIST];
const INTERVAL_OPTIONS = INTERVAL_PRESETS.map((preset) => ({ value: String(preset.days), label: preset.label }));

export default function NewScheduleScreen() {
  const [category, setCategory] = useState<RoutineCategory | null>(null);
  const [title, setTitle] = useState('');
  const [intervalDays, setIntervalDays] = useState<string>('90');
  const [speciesFilter, setSpeciesFilter] = useState<Species | 'all'>('all');
  const [firstDueDate, setFirstDueDate] = useState(getRelativeDateIso(0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const intervalNumber = Number.parseInt(intervalDays, 10) || 0;
  const canSave = category !== null && title.trim().length > 0 && intervalNumber > 0;

  function handleCategory(next: RoutineCategory) {
    setCategory(next);
    // Fill in sensible defaults so a common task takes a couple of taps, not a form.
    setIntervalDays(String(ROUTINE_CATEGORY_META[next].defaultIntervalDays));
    if (!title.trim()) setTitle(ROUTINE_CATEGORY_META[next].label);
  }

  async function handleSave() {
    if (!canSave || !category) return;
    setSaving(true);
    setError(null);
    try {
      await db.insert(reminderSchedules).values({
        title: title.trim(),
        category,
        intervalDays: intervalNumber,
        speciesFilter: speciesFilter === 'all' ? null : speciesFilter,
        nextDueDate: firstDueDate,
      });
      notifySaved();
      // Not awaited — see the note in log/breeding.tsx. Rescheduling notifications can block on
      // an OS permission dialog, which must not stall confirmation that the task was saved.
      refreshRemindersAndNotifications().catch(() => {});
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this task.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer footer={<Button label="Save task" fullWidth loading={saving} disabled={!canSave} onPress={handleSave} />}>
      <Text className="pt-2 text-callout text-secondary">
        A repeating task reminds you again automatically each time you mark it done.
      </Text>

      <SelectGroup label="Task" required options={ROUTINE_CATEGORY_LIST} value={category} onChange={handleCategory} />

      <TextField label="Name" required value={title} onChangeText={setTitle} placeholder="e.g. Deworm the goats" />

      <SelectGroup label="Repeat every" options={INTERVAL_OPTIONS} value={intervalDays} onChange={setIntervalDays} columns={3} />
      <TextField
        label="Or a custom number of days"
        value={intervalDays}
        onChangeText={setIntervalDays}
        keyboardType="number-pad"
      />

      <SelectGroup label="Applies to" options={SPECIES_OPTIONS} value={speciesFilter} onChange={setSpeciesFilter} />

      <QuickDateSelector label="First due" valueIso={firstDueDate} onChange={setFirstDueDate} direction="future" />

      {canSave ? (
        <Callout tone="earth">
          {`First reminder ${formatDateForDisplay(firstDueDate)}, then every ${intervalNumber} days.`}
        </Callout>
      ) : null}

      {error ? <Text className="text-callout text-danger">{error}</Text> : null}
    </ScreenContainer>
  );
}
