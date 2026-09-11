import { useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { desc, eq } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { SelectGroup } from '@/components/ui/SelectGroup';
import { TextField } from '@/components/ui/TextField';
import { QuickDateSelector } from '@/components/ui/QuickDateSelector';
import { Callout } from '@/components/ui/Callout';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { db } from '@/db/client';
import { currentFlockCount } from '@/db/flocks';
import { flockEvents, flocks, type FlockEventType } from '@/db/schema';
import { getRelativeDateIso } from '@/utils/livestockRules';
import { FLOCK_EVENT_META, FLOCK_EVENT_OPTIONS } from '@/utils/poultryRules';
import { notifySaved } from '@/lib/haptics';

export default function LogFlockEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Deaths are what a poultry farmer records most days, so it is the one already selected.
  const [type, setType] = useState<FlockEventType>('mortality');
  const [eventDate, setEventDate] = useState(getRelativeDateIso(0));
  const [quantity, setQuantity] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: flockRows, updatedAt } = useLiveQuery(db.select().from(flocks).where(eq(flocks.id, id)), [id]);
  const flock = flockRows?.[0];

  const { data: events } = useLiveQuery(
    db.select().from(flockEvents).where(eq(flockEvents.flockId, id)).orderBy(desc(flockEvents.eventDate)),
    [id],
  );

  const meta = FLOCK_EVENT_META[type];
  const quantityNumber = Number.parseInt(quantity, 10);
  const validQuantity = Number.isFinite(quantityNumber) && quantityNumber > 0;
  const canSave = !meta.needsQuantity || validQuantity;

  const birdsNow = flock ? currentFlockCount(flock, events ?? []) : 0;
  const birdsAfter = meta.needsQuantity && validQuantity
    ? meta.reducesCount
      ? Math.max(0, birdsNow - quantityNumber)
      : birdsNow + quantityNumber
    : birdsNow;

  const tooMany = meta.reducesCount && validQuantity && quantityNumber > birdsNow;

  async function handleSave() {
    if (!canSave || !flock) return;
    setSaving(true);
    setError(null);
    try {
      await db.insert(flockEvents).values({
        flockId: id,
        type,
        eventDate,
        quantity: meta.needsQuantity ? quantityNumber : null,
        description: description.trim() || null,
      });
      notifySaved();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this entry.');
    } finally {
      setSaving(false);
    }
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
    <ScreenContainer footer={<Button label="Save" fullWidth loading={saving} disabled={!canSave} onPress={handleSave} />}>
      <Text className="pt-2 text-callout text-secondary">
        {flock.name} · {birdsNow} {birdsNow === 1 ? 'bird' : 'birds'}
      </Text>

      <SelectGroup label="What happened" required options={FLOCK_EVENT_OPTIONS} value={type} onChange={setType} />

      {meta.needsQuantity ? (
        <TextField
          label="How many birds"
          required
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="number-pad"
          placeholder="0"
          error={tooMany ? `You only have ${birdsNow} birds in this flock.` : undefined}
        />
      ) : null}

      <TextField
        label={type === 'vaccination' ? 'Which vaccine' : type === 'feed_change' ? 'Switched to' : 'Details'}
        value={description}
        onChangeText={setDescription}
        placeholder={
          type === 'vaccination'
            ? 'e.g. Newcastle, Gumboro'
            : type === 'feed_change'
              ? 'e.g. Growers mash'
              : 'Optional'
        }
      />

      <QuickDateSelector label="When" valueIso={eventDate} onChange={setEventDate} />

      {meta.needsQuantity && validQuantity && !tooMany ? (
        <Callout tone={meta.reducesCount ? 'warn' : 'brand'}>
          {`The flock will be ${birdsAfter} ${birdsAfter === 1 ? 'bird' : 'birds'} after this.`}
        </Callout>
      ) : null}

      {error ? <Text className="text-callout text-danger">{error}</Text> : null}
    </ScreenContainer>
  );
}
