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
import { db } from '@/db/client';
import { getSettings } from '@/db/reminders';
import { EXPENSE_CATEGORIES, expenses, type Animal, type ExpenseCategory } from '@/db/schema';
import { getRelativeDateIso } from '@/utils/livestockRules';
import { formatMoney } from '@/utils/money';
import { notifySaved } from '@/lib/haptics';

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  feed: 'Feed',
  supplement: 'Supplement',
  medication: 'Medication',
  veterinary: 'Vet',
  labour: 'Labour',
  equipment: 'Equipment',
  other: 'Other',
};

const CATEGORY_OPTIONS = EXPENSE_CATEGORIES.map((category) => ({ value: category, label: CATEGORY_LABELS[category] }));

export default function NewExpenseScreen() {
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [expenseDate, setExpenseDate] = useState(getRelativeDateIso(0));
  const [animal, setAnimal] = useState<Animal | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [currency, setCurrency] = useState('KES');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings()
      .then((prefs) => setCurrency(prefs?.currency ?? 'KES'))
      .catch(() => {});
  }, []);

  const amountNumber = Number.parseFloat(amount);
  const validAmount = Number.isFinite(amountNumber) && amountNumber > 0;
  const canSave = category !== null && description.trim().length > 0 && validAmount;

  const quantityNumber = Number.parseFloat(quantity);
  const unitCost = validAmount && Number.isFinite(quantityNumber) && quantityNumber > 0 ? amountNumber / quantityNumber : null;

  async function handleSave() {
    if (!canSave || !category) return;
    setSaving(true);
    setError(null);
    try {
      await db.insert(expenses).values({
        category,
        description: description.trim(),
        amount: amountNumber,
        quantity: Number.isFinite(quantityNumber) && quantityNumber > 0 ? quantityNumber : null,
        unit: unit.trim() || null,
        expenseDate,
        animalId: animal?.id ?? null,
      });
      notifySaved();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this expense.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer footer={<Button label="Save expense" fullWidth loading={saving} disabled={!canSave} onPress={handleSave} />}>
      <SelectGroup label="What was it for" required options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />

      <TextField
        label="Description"
        required
        value={description}
        onChangeText={setDescription}
        placeholder="e.g. Dairy meal, 2 bags"
      />

      <TextField
        label={`Amount paid (${currency})`}
        required
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0"
      />

      <View className="flex-row gap-3">
        <View className="flex-1">
          <TextField label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="Optional" />
        </View>
        <View className="flex-1">
          <TextField label="Unit" value={unit} onChangeText={setUnit} placeholder="kg, bags" autoCapitalize="none" />
        </View>
      </View>

      {unitCost !== null ? (
        <Callout tone="earth">{`That works out to ${formatMoney(unitCost, currency)} per ${unit.trim() || 'unit'}.`}</Callout>
      ) : null}

      <QuickDateSelector label="Date" valueIso={expenseDate} onChange={setExpenseDate} />

      <SelectedAnimalField label="For one animal (optional)" animal={animal} onPress={() => setPickerOpen(true)} />
      <Text className="-mt-1 text-label text-tertiary">
        Leave blank for herd-wide costs like feed. Link a vet bill to the animal it was for.
      </Text>

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
