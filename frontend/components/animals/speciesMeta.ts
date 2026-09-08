import type { AnimalStatus, Species } from '@/db/schema';

export const SPECIES_EMOJI: Record<Species, string> = {
  cow: '🐄',
  goat: '🐐',
  sheep: '🐑',
  pig: '🐖',
  horse: '🐎',
  donkey: '🫏',
  dog: '🐕',
};

export const STATUS_META: Record<AnimalStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-brand-100 text-brand-700' },
  sold: { label: 'Sold', className: 'bg-ink-100 text-ink-700' },
  deceased: { label: 'Deceased', className: 'bg-ink-100 text-ink-500' },
  in_withdrawal: { label: 'In withdrawal', className: 'bg-warning-100 text-warning-600' },
};
