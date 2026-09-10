import type { Ionicons } from '@expo/vector-icons';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, type ExpenseCategory, type IncomeCategory } from '@/db/schema';

interface CategoryMeta {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export const EXPENSE_CATEGORY_META: Record<ExpenseCategory, CategoryMeta> = {
  feed: { label: 'Feed', icon: 'nutrition-outline' },
  supplement: { label: 'Supplements', icon: 'flask-outline' },
  medication: { label: 'Medication', icon: 'medkit-outline' },
  veterinary: { label: 'Vet', icon: 'bandage-outline' },
  breeding_ai: { label: 'Breeding / AI', icon: 'heart-outline' },
  labour: { label: 'Labour', icon: 'people-outline' },
  transport: { label: 'Transport', icon: 'car-outline' },
  water: { label: 'Water', icon: 'water-outline' },
  electricity: { label: 'Power', icon: 'flash-outline' },
  housing: { label: 'Housing', icon: 'home-outline' },
  equipment: { label: 'Equipment', icon: 'construct-outline' },
  other: { label: 'Other', icon: 'ellipsis-horizontal-outline' },
};

export const INCOME_CATEGORY_META: Record<IncomeCategory, CategoryMeta> = {
  animal_sale: { label: 'Animal sale', icon: 'pricetag-outline' },
  eggs: { label: 'Eggs', icon: 'egg-outline' },
  manure: { label: 'Manure', icon: 'leaf-outline' },
  breeding_fee: { label: 'Breeding fee', icon: 'heart-outline' },
  other: { label: 'Other', icon: 'ellipsis-horizontal-outline' },
};

export const EXPENSE_CATEGORY_OPTIONS = EXPENSE_CATEGORIES.map((category) => ({
  value: category,
  label: EXPENSE_CATEGORY_META[category].label,
}));

export const INCOME_CATEGORY_OPTIONS = INCOME_CATEGORIES.map((category) => ({
  value: category,
  label: INCOME_CATEGORY_META[category].label,
}));
