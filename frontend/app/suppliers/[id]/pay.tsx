import { useEffect, useState } from 'react';
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
import { getSettings } from '@/db/reminders';
import { supplierBalance } from '@/db/suppliers';
import { expenses, supplierPayments, suppliers } from '@/db/schema';
import { getRelativeDateIso } from '@/utils/livestockRules';
import { formatMoney } from '@/utils/money';
import { notifySaved } from '@/lib/haptics';

export default function PaySupplierScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: rows } = useLiveQuery(db.select().from(suppliers).where(eq(suppliers.id, id)), [id]);
  const supplier = rows?.[0];

  const { data: bills } = useLiveQuery(db.select().from(expenses).where(eq(expenses.supplierId, id)), [id]);
  const { data: paid } = useLiveQuery(
    db.select().from(supplierPayments).where(eq(supplierPayments.supplierId, id)),
    [id],
  );

  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(getRelativeDateIso(0));
  const [currency, setCurrency] = useState('KES');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings()
      .then((prefs) => setCurrency(prefs?.currency ?? 'KES'))
      .catch(() => {});
  }, []);

  const owed = supplierBalance(bills ?? [], paid ?? []);
  const amountNumber = Number.parseFloat(amount);
  const validAmount = Number.isFinite(amountNumber) && amountNumber > 0;
  const remaining = validAmount ? owed - amountNumber : owed;

  async function handleSave() {
    if (!validAmount) return;
    setSaving(true);
    setError(null);
    try {
      await db.insert(supplierPayments).values({ supplierId: id, paymentDate, amount: amountNumber });
      notifySaved();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this payment.');
    } finally {
      setSaving(false);
    }
  }

  if (!supplier) {
    return (
      <ScreenContainer>
        <EmptyState icon="storefront-outline" title="Supplier not found" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer footer={<Button label="Save payment" fullWidth loading={saving} disabled={!validAmount} onPress={handleSave} />}>
      <Text className="pt-2 text-callout text-secondary">
        You owe {supplier.name} {formatMoney(Math.max(0, owed), currency)}.
      </Text>

      <TextField
        label={`Amount paid (${currency})`}
        required
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0"
      />

      {owed > 0 ? (
        <Button
          label={`Pay it all — ${formatMoney(owed, currency)}`}
          variant="secondary"
          fullWidth
          onPress={() => setAmount(String(Math.round(owed * 100) / 100))}
        />
      ) : null}

      <QuickDateSelector label="When" valueIso={paymentDate} onChange={setPaymentDate} />

      {validAmount ? (
        <Callout tone={remaining > 0 ? 'warn' : 'brand'}>
          {remaining > 0
            ? `${formatMoney(remaining, currency)} still owing after this`
            : remaining < 0
              ? `You would be ${formatMoney(Math.abs(remaining), currency)} in credit`
              : 'That clears the account'}
        </Callout>
      ) : null}

      <Text className="text-label text-tertiary">
        Paying a bill does not change your costs — the purchase was already counted on the day you took it.
      </Text>

      {error ? <Text className="text-callout text-danger">{error}</Text> : null}
    </ScreenContainer>
  );
}
