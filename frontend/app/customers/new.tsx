import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { db } from '@/db/client';
import { customers } from '@/db/schema';
import { notifySaved } from '@/lib/haptics';

export default function NewCustomerScreen() {
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
        .insert(customers)
        .values({ name: name.trim(), phone: phone.trim() || null })
        .returning();
      notifySaved();
      router.replace(`/customers/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this customer.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer footer={<Button label="Save customer" fullWidth loading={saving} disabled={!canSave} onPress={handleSave} />}>
      <TextField label="Name" required value={name} onChangeText={setName} placeholder="e.g. Mama Njeri" />
      <TextField
        label="Phone"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="Optional"
        hint="Handy when it is time to ask about the balance."
      />
      {error ? <Text className="text-callout text-danger">{error}</Text> : null}
    </ScreenContainer>
  );
}
