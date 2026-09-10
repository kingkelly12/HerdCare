import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { eq } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { SelectGroup } from '@/components/ui/SelectGroup';
import { TextField } from '@/components/ui/TextField';
import { QuickDateSelector } from '@/components/ui/QuickDateSelector';
import { Callout } from '@/components/ui/Callout';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { db } from '@/db/client';
import { PRODUCT_META, PRODUCT_OPTIONS } from '@/db/customers';
import { getSettings } from '@/db/reminders';
import { customers, deliveries, type DeliveryProduct } from '@/db/schema';
import { getRelativeDateIso } from '@/utils/livestockRules';
import { formatMoney } from '@/utils/money';
import { notifySaved } from '@/lib/haptics';

export default function RecordDeliveryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: rows } = useLiveQuery(db.select().from(customers).where(eq(customers.id, id)), [id]);
  const customer = rows?.[0];

  const [product, setProduct] = useState<DeliveryProduct>('milk');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(getRelativeDateIso(0));
  const [currency, setCurrency] = useState('KES');
  const [prices, setPrices] = useState({ milk: 0, eggs: 0, meat: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings()
      .then((prefs) => {
        if (!prefs) return;
        setCurrency(prefs.currency ?? 'KES');
        setPrices({
          milk: prefs.milkPricePerLitre ?? 0,
          eggs: prefs.eggPricePerTray ?? 0,
          meat: prefs.meatPricePerKg ?? 0,
        });
      })
      .catch(() => {});
  }, []);

  // The standing price fills itself in when the product changes. A live animal has no standing
  // price — a goat and a cockerel are not remotely comparable — so that one is always typed.
  useEffect(() => {
    if (product === 'live_animal') {
      setUnitPrice('');
      return;
    }
    setUnitPrice(String(prices[product] ?? 0));
  }, [product, prices]);

  const quantityNumber = Number.parseFloat(quantity);
  const priceNumber = Number.parseFloat(unitPrice);
  const validQuantity = Number.isFinite(quantityNumber) && quantityNumber > 0;
  const validPrice = Number.isFinite(priceNumber) && priceNumber >= 0;
  const canSave = validQuantity && validPrice;
  const value = canSave ? quantityNumber * priceNumber : 0;
  const meta = PRODUCT_META[product];

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await db.insert(deliveries).values({
        customerId: id,
        product,
        deliveryDate,
        quantity: quantityNumber,
        unitPrice: priceNumber,
      });
      notifySaved();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this delivery.');
    } finally {
      setSaving(false);
    }
  }

  if (!customer) {
    return (
      <ScreenContainer>
        <EmptyState icon="person-outline" title="Customer not found" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer footer={<Button label="Save delivery" fullWidth loading={saving} disabled={!canSave} onPress={handleSave} />}>
      <Text className="pt-2 text-callout text-secondary">What {customer.name} took.</Text>

      <SelectGroup label="Product" required options={PRODUCT_OPTIONS} value={product} onChange={setProduct} />

      <TextField
        label={product === 'live_animal' ? 'How many animals' : `How many ${meta.unitLong}`}
        required
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="decimal-pad"
        placeholder="0"
      />

      <TextField
        label={`Price ${product === 'live_animal' ? 'each' : `per ${meta.unit || 'unit'}`} (${currency})`}
        required
        value={unitPrice}
        onChangeText={setUnitPrice}
        keyboardType="decimal-pad"
        placeholder="0"
        hint={
          product === 'live_animal'
            ? 'Typed each time, since live animals vary too much for a standing price.'
            : 'Filled in from your usual price. Change it here for a one-off — the delivery keeps whatever it was saved with.'
        }
      />

      <QuickDateSelector label="When" valueIso={deliveryDate} onChange={setDeliveryDate} />

      {canSave ? <Callout tone="warn">{`Adds ${formatMoney(value, currency)} to what they owe`}</Callout> : null}

      {product === 'milk' ? (
        <Text className="text-label text-tertiary">
          Milk is already counted as income when you record the milking, so this only tracks what {customer.name} owes —
          it will not be added to your earnings twice.
        </Text>
      ) : null}

      {error ? <Text className="text-callout text-danger">{error}</Text> : null}
    </ScreenContainer>
  );
}
