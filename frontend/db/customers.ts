import type { Ionicons } from '@expo/vector-icons';
import { REVENUE_BEARING_PRODUCTS, type CustomerPayment, type Delivery, type DeliveryProduct } from './schema';

export const PRODUCT_META: Record<
  DeliveryProduct,
  { label: string; unit: string; unitLong: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  milk: { label: 'Milk', unit: 'L', unitLong: 'litres', icon: 'water-outline' },
  eggs: { label: 'Eggs', unit: 'trays', unitLong: 'trays', icon: 'egg-outline' },
  meat: { label: 'Meat', unit: 'kg', unitLong: 'kilos', icon: 'restaurant-outline' },
  live_animal: { label: 'Live animal', unit: '', unitLong: 'animals', icon: 'paw-outline' },
};

export const PRODUCT_OPTIONS = (Object.keys(PRODUCT_META) as DeliveryProduct[]).map((value) => ({
  value,
  label: PRODUCT_META[value].label,
}));

/** What one delivery is worth. Computed, so the price and the total can never disagree. */
export function deliveryValue(delivery: Pick<Delivery, 'quantity' | 'unitPrice'>): number {
  return delivery.quantity * delivery.unitPrice;
}

export function totalDelivered(deliveries: Pick<Delivery, 'quantity' | 'unitPrice'>[]): number {
  return deliveries.reduce((sum, delivery) => sum + deliveryValue(delivery), 0);
}

export function totalPaid(payments: Pick<CustomerPayment, 'amount'>[]): number {
  return payments.reduce((sum, payment) => sum + payment.amount, 0);
}

/** What the customer still owes. Negative means they have paid ahead. */
export function customerBalance(
  deliveries: Pick<Delivery, 'quantity' | 'unitPrice'>[],
  payments: Pick<CustomerPayment, 'amount'>[],
): number {
  return totalDelivered(deliveries) - totalPaid(payments);
}

/**
 * The part of deliveries that counts as revenue.
 *
 * Milk is excluded: it was already counted as earned when the milking was recorded, so counting
 * it again here would inflate profit for every litre a neighbour takes. Eggs, meat and live
 * animals have no production record putting them on the books, so for those the delivery *is*
 * the sale.
 */
export function deliveryRevenue(deliveries: Pick<Delivery, 'product' | 'quantity' | 'unitPrice'>[]): number {
  return deliveries
    .filter((delivery) => (REVENUE_BEARING_PRODUCTS as readonly string[]).includes(delivery.product))
    .reduce((sum, delivery) => sum + deliveryValue(delivery), 0);
}

/** Formats a quantity with the unit that fits the product — "12 L", "3 trays", "2 animals". */
export function formatQuantity(product: DeliveryProduct, quantity: number): string {
  const rounded = Math.round(quantity * 10) / 10;
  const meta = PRODUCT_META[product];
  if (product === 'live_animal') return `${rounded} ${rounded === 1 ? 'animal' : 'animals'}`;
  return `${rounded} ${meta.unit}`;
}
