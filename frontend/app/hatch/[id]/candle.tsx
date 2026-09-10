import { useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { eq } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { TextField } from '@/components/ui/TextField';
import { QuickDateSelector } from '@/components/ui/QuickDateSelector';
import { Callout } from '@/components/ui/Callout';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { db } from '@/db/client';
import { hatchBatches } from '@/db/schema';
import { getRelativeDateIso } from '@/utils/livestockRules';
import { notifySaved } from '@/lib/haptics';
import { refreshRemindersAndNotifications } from '@/lib/reminderSync';

export default function CandleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: rows } = useLiveQuery(db.select().from(hatchBatches).where(eq(hatchBatches.id, id)), [id]);
  const batch = rows?.[0];

  const [candledDate, setCandledDate] = useState(getRelativeDateIso(0));
  const [fertile, setFertile] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fertileNumber = Number.parseInt(fertile, 10);
  const validFertile = Number.isFinite(fertileNumber) && fertileNumber >= 0;
  const tooMany = batch ? validFertile && fertileNumber > batch.eggsSet : false;
  const canSave = validFertile && !tooMany;
  const rate = batch && validFertile && batch.eggsSet > 0 ? (fertileNumber / batch.eggsSet) * 100 : null;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await db
        .update(hatchBatches)
        .set({ candledDate, fertileEggs: fertileNumber, updatedAt: new Date().toISOString() })
        .where(eq(hatchBatches.id, id));
      notifySaved();
      refreshRemindersAndNotifications().catch(() => {});
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this candling.');
    } finally {
      setSaving(false);
    }
  }

  if (!batch) {
    return (
      <ScreenContainer>
        <EmptyState icon="egg-outline" title="Batch not found" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer footer={<Button label="Save candling" fullWidth loading={saving} disabled={!canSave} onPress={handleSave} />}>
      <Text className="pt-2 text-callout text-secondary">
        {batch.eggsSet} eggs were set. Count the ones still developing and take out the clears.
      </Text>

      <TextField
        label="Eggs still developing"
        required
        value={fertile}
        onChangeText={setFertile}
        keyboardType="number-pad"
        placeholder="0"
        error={tooMany ? `Only ${batch.eggsSet} eggs were set.` : undefined}
      />

      <QuickDateSelector label="Date candled" valueIso={candledDate} onChange={setCandledDate} />

      {rate !== null && !tooMany ? (
        <Callout tone={rate < 70 ? 'warn' : 'brand'}>
          {`${Math.round(rate)}% fertile${
            rate < 70 ? '. Below about 70% usually points at the breeding birds rather than the incubator.' : ''
          }`}
        </Callout>
      ) : null}

      {error ? <Text className="text-callout text-danger">{error}</Text> : null}
    </ScreenContainer>
  );
}
