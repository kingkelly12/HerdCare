import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { SelectGroup } from '@/components/ui/SelectGroup';
import { TextField } from '@/components/ui/TextField';
import { QuickDateSelector } from '@/components/ui/QuickDateSelector';
import { Callout } from '@/components/ui/Callout';
import { Button } from '@/components/ui/Button';
import { AnimalSearchModal } from '@/components/animals/AnimalSearchModal';
import { SelectedAnimalField } from '@/components/animals/SelectedAnimalField';
import { PressableSurface } from '@/components/ui/Surface';
import { db } from '@/db/client';
import { getSettings } from '@/db/reminders';
import { expenses, incomeEntries, suppliers, type Animal, type ExpenseCategory, type IncomeCategory } from '@/db/schema';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { getRelativeDateIso } from '@/utils/livestockRules';
import { formatMoney } from '@/utils/money';
import { EXPENSE_CATEGORY_OPTIONS, INCOME_CATEGORY_OPTIONS } from '@/utils/financeCategories';
import { notifySaved } from '@/lib/haptics';

type Direction = 'income' | 'expense';

interface FinanceEntryFormProps {
  direction: Direction;
  /** Pre-selects a supplier when the form is opened from their account. */
  supplierId?: string;
  /** Pre-fills the form when it is opened from another flow, e.g. selling an animal. */
  initial?: {
    category?: string;
    description?: string;
    animal?: Animal | null;
  };
}

const COPY: Record<Direction, { categoryLabel: string; amountLabel: string; save: string; animalLabel: string; animalHint: string }> = {
  income: {
    categoryLabel: 'Where the money came from',
    amountLabel: 'Amount received',
    save: 'Save income',
    animalLabel: 'From one animal (optional)',
    animalHint: 'Link a sale or stud fee to the animal it came from, so you can see what she returned.',
  },
  expense: {
    categoryLabel: 'What was it for',
    amountLabel: 'Amount paid',
    save: 'Save expense',
    animalLabel: 'For one animal (optional)',
    animalHint: 'Leave blank for herd-wide costs like feed. Link a vet bill to the animal it was for.',
  },
};

export function FinanceEntryForm({ direction, initial, supplierId }: FinanceEntryFormProps) {
  const copy = COPY[direction];
  const options = direction === 'income' ? INCOME_CATEGORY_OPTIONS : EXPENSE_CATEGORY_OPTIONS;

  const [category, setCategory] = useState<string | null>(initial?.category ?? null);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [entryDate, setEntryDate] = useState(getRelativeDateIso(0));
  const [animal, setAnimal] = useState<Animal | null>(initial?.animal ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [currency, setCurrency] = useState('KES');
  // Only meaningful for money out: tagging a supplier is what marks a purchase as on credit.
  const [supplier, setSupplier] = useState<string | null>(supplierId ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: supplierRows } = useLiveQuery(db.select().from(suppliers).orderBy(suppliers.name));

  useEffect(() => {
    getSettings()
      .then((prefs) => setCurrency(prefs?.currency ?? 'KES'))
      .catch(() => {});
  }, []);

  const amountNumber = Number.parseFloat(amount);
  const validAmount = Number.isFinite(amountNumber) && amountNumber > 0;
  const canSave = category !== null && description.trim().length > 0 && validAmount;

  const quantityNumber = Number.parseFloat(quantity);
  const hasQuantity = Number.isFinite(quantityNumber) && quantityNumber > 0;
  const unitPrice = validAmount && hasQuantity ? amountNumber / quantityNumber : null;

  async function handleSave() {
    if (!canSave || !category) return;
    setSaving(true);
    setError(null);
    try {
      const shared = {
        description: description.trim(),
        amount: amountNumber,
        quantity: hasQuantity ? quantityNumber : null,
        unit: unit.trim() || null,
        animalId: animal?.id ?? null,
      };

      if (direction === 'income') {
        await db.insert(incomeEntries).values({
          ...shared,
          category: category as IncomeCategory,
          incomeDate: entryDate,
        });
      } else {
        await db.insert(expenses).values({
          ...shared,
          category: category as ExpenseCategory,
          expenseDate: entryDate,
          supplierId: supplier,
        });
      }
      notifySaved();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this entry.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer footer={<Button label={copy.save} fullWidth loading={saving} disabled={!canSave} onPress={handleSave} />}>
      <SelectGroup label={copy.categoryLabel} required options={options} value={category} onChange={setCategory} />

      <TextField
        label="Description"
        required
        value={description}
        onChangeText={setDescription}
        placeholder={direction === 'income' ? 'e.g. Sold bull calf to Mwangi' : 'e.g. Dairy meal, 2 bags'}
      />

      <TextField
        label={`${copy.amountLabel} (${currency})`}
        required
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0"
      />

      <View className="flex-row gap-3">
        <View className="flex-1">
          <TextField
            label="Quantity"
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
            placeholder="Optional"
          />
        </View>
        <View className="flex-1">
          <TextField label="Unit" value={unit} onChangeText={setUnit} placeholder="kg, bags, trays" autoCapitalize="none" />
        </View>
      </View>

      {unitPrice !== null ? (
        <Callout tone="earth">{`That works out to ${formatMoney(unitPrice, currency)} per ${unit.trim() || 'unit'}.`}</Callout>
      ) : null}

      <QuickDateSelector label="Date" valueIso={entryDate} onChange={setEntryDate} />

      <SelectedAnimalField label={copy.animalLabel} animal={animal} onPress={() => setPickerOpen(true)} />
      <Text className="-mt-1 text-label text-tertiary">{copy.animalHint}</Text>

      {direction === 'expense' && (supplierRows?.length ?? 0) > 0 ? (
        <View className="gap-2">
          <Text className="text-label font-sans-semibold uppercase text-tertiary">Taken on credit from</Text>
          {(supplierRows ?? []).map((row) => (
            <PressableSurface
              key={row.id}
              onPress={() => setSupplier(supplier === row.id ? null : row.id)}
              className={`min-h-touch flex-row items-center justify-between p-3 ${supplier === row.id ? 'border-brand' : ''}`}
            >
              <Text className="text-body font-sans-medium text-primary">{row.name}</Text>
              {supplier === row.id ? <Text className="text-callout font-sans-semibold text-brand">On credit</Text> : null}
            </PressableSurface>
          ))}
          <Text className="text-label text-tertiary">
            Leave this alone if you paid cash. Tagging a supplier adds it to what you owe them — the cost itself counts
            either way, from today.
          </Text>
        </View>
      ) : null}

      {error ? <Text className="text-callout text-danger">{error}</Text> : null}

      <AnimalSearchModal
        visible={pickerOpen}
        title="Select animal"
        onSelect={setAnimal}
        onClose={() => setPickerOpen(false)}
      />
    </ScreenContainer>
  );
}
