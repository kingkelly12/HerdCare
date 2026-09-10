import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { db } from '@/db/client';
import { suppliers } from '@/db/schema';
import { notifySaved } from '@/lib/haptics';

export default function NewSupplierScreen() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim().length > 0;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const [created] = await db
        .insert(suppliers)
        .values({ name: name.trim(), phone: phone.trim() || null })
        .returning();
      notifySaved();
      router.replace(`/suppliers/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this supplier.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer footer={<Button label="Save supplier" fullWidth loading={saving} disabled={!canSave} onPress={handleSave} />}>
      <TextField label="Name" required value={name} onChangeText={setName} placeholder="e.g. Kimani Agrovet" />
      <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Optional" />
      <Text className="text-label text-tertiary">
        Once they are here, tag a purchase to them when you take feed or supplements on credit.
      </Text>
      {error ? <Text className="text-callout text-danger">{error}</Text> : null}
    </ScreenContainer>
  );
}
