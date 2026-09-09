import type { AnimalStatus } from '@/db/schema';

/**
 * Status pill styling. Colours come from semantic tokens so both themes are covered without
 * per-component dark variants.
 */
export const STATUS_META: Record<AnimalStatus, { label: string; container: string; text: string }> = {
  active: { label: 'Active', container: 'bg-brand-soft', text: 'text-brand' },
  sold: { label: 'Sold', container: 'bg-sunken', text: 'text-secondary' },
  deceased: { label: 'Deceased', container: 'bg-sunken', text: 'text-tertiary' },
  in_withdrawal: { label: 'Withdrawal', container: 'bg-warn-soft', text: 'text-warn' },
};
