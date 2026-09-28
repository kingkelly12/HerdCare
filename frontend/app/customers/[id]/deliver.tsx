import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
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
import { PRODUCT_META, PRODUCT_OPTIONS, formatQuantity, unitPriceLabel } from '@/db/customers';
import { Segmented } from '@/components/ui/Segmented';
import { getSettings, updateSettings } from '@/db/reminders';
import { useColors } from '@/theme/colors';
import { EGG_UNITS, customers, deliveries, type DeliveryProduct, type EggUnit } from '@/db/schema';
import { getRelativeDateIso } from '@/utils/livestockRules';
import { formatMoney } from '@/utils/money';

/** Where each standing price is kept, so a new usual price can be saved from this form. */
const PRICE_FIELD = {
  milk: 'milkPricePerLitre',
  tray: 'eggPricePerTray',
  egg: 'eggPricePerEgg',
  meat: 'meatPricePerKg',
} as const;

const EGG_UNIT_OPTIONS = EGG_UNITS.map((value) => ({
  value,
  label: value === 'tray' ? 'The tray' : 'The egg',
}));

export default function RecordDeliveryScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: rows, updatedAt } = useLiveQuery(db.select().from(customers).where(eq(customers.id, id)), [id]);
  const customer = rows?.[0];

  const [product, setProduct] = useState<DeliveryProduct>('milk');
  // Eggs go out by the tray or loose by the egg, at different prices.
  const [eggUnit, setEggUnit] = useState<EggUnit>('tray');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(getRelativeDateIso(0));
  const [currency, setCurrency] = useState('KES');
  const [prices, setPrices] = useState({ milk: 0, tray: 0, egg: 0, meat: 0 });
  // Whether the price typed here becomes the usual one. Selling prices used to live on a Settings
  // card; they are set here instead, where the farmer is actually thinking about what things cost.
  const [rememberPrice, setRememberPrice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings()
      .then((prefs) => {
        if (!prefs) return;
        setCurrency(prefs.currency ?? 'KES');
        setPrices({
          milk: prefs.milkPricePerLitre ?? 0,
          tray: prefs.eggPricePerTray ?? 0,
          egg: prefs.eggPricePerEgg ?? 0,
          meat: prefs.meatPricePerKg ?? 0,
        });
      })
      .catch(() => {});
  }, []);

  // The standing price fills itself in when the product changes. A live animal has no standing
  // price — a goat and a cockerel are not remotely comparable — so that one is always typed.
  const priceKey = product === 'live_animal' ? null : product === 'eggs' ? eggUnit : product;
  const standingPrice = priceKey ? prices[priceKey] : 0;

  useEffect(() => {
    // No usual price yet: leave the field empty rather than showing a 0 to type over, and keep the
    // first price the farmer types as their usual one.
    setUnitPrice(priceKey && standingPrice > 0 ? String(standingPrice) : '');
    setRememberPrice(Boolean(priceKey) && standingPrice <= 0);
  }, [priceKey, standingPrice]);

  const quantityNumber = Number.parseFloat(quantity);
  const priceNumber = Number.parseFloat(unitPrice);
  const validQuantity = Number.isFinite(quantityNumber) && quantityNumber > 0;
  const validPrice = Number.isFinite(priceNumber) && priceNumber >= 0;
  const canSave = validQuantity && validPrice;
  const priceDiffers = Boolean(priceKey) && validPrice && priceNumber !== standingPrice;
  const value = canSave ? quantityNumber * priceNumber : 0;
  const quantityLabel =
    product === 'live_animal'
      ? 'How many animals'
      : product === 'eggs'
        ? eggUnit === 'egg'
          ? 'How many eggs'
          : 'How many trays'
        : `How many ${PRODUCT_META[product].unitLong}`;

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
        // Only eggs carry a unit; everything else has just the one.
        unit: product === 'eggs' ? eggUnit : null,
        unitPrice: priceNumber,
      });
      if (priceKey && priceDiffers && rememberPrice) {
        await updateSettings({ [PRICE_FIELD[priceKey]]: priceNumber });
      }
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this delivery.');
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

      {product === 'eggs' ? (
        <View className="gap-2">
          <Text className="text-label font-sans-semibold uppercase text-tertiary">Sold by</Text>
          <Segmented options={EGG_UNIT_OPTIONS} value={eggUnit} onChange={setEggUnit} />
        </View>
      ) : null}

      <TextField
        label={quantityLabel}
        required
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="decimal-pad"
        placeholder="0"
      />

      <TextField
        label={`Price ${unitPriceLabel(product, eggUnit)} (${currency})`}
        required
        value={unitPrice}
        onChangeText={setUnitPrice}
        keyboardType="decimal-pad"
        placeholder="0"
        hint={
          product === 'live_animal'
            ? 'Typed each time, since live animals vary too much for a usual price.'
            : standingPrice > 0
              ? 'Your usual price. Change it for this delivery if you need to.'
              : 'No usual price yet. What you type here is remembered for next time.'
        }
      />

      {priceDiffers ? (
        <View className="flex-row items-center justify-between gap-3 rounded-field bg-surface px-4 py-3">
          <View className="flex-1">
            <Text className="text-callout font-sans-medium text-primary">Make this my usual price</Text>
            <Text className="text-label text-tertiary">
              {rememberPrice
                ? 'Future deliveries start at this price.'
                : 'Only this delivery. Your usual price stays the same.'}
            </Text>
          </View>
          <Switch
            value={rememberPrice}
            onValueChange={setRememberPrice}
            trackColor={{ true: colors.brand, false: colors.borderStrong }}
            thumbColor={colors.raised}
            accessibilityLabel="Make this my usual price"
          />
        </View>
      ) : null}

      <QuickDateSelector label="When" valueIso={deliveryDate} onChange={setDeliveryDate} />

      {canSave ? (
        <Callout tone="warn">
          {`${formatQuantity({ product, unit: product === 'eggs' ? eggUnit : null, quantity: quantityNumber })} · adds ${formatMoney(value, currency)} to what they owe`}
        </Callout>
      ) : null}

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
