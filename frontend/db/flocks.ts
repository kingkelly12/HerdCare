import type { Flock, FlockEvent } from './schema';
import { FLOCK_EVENT_META } from '@/utils/poultryRules';

/**
 * How many birds are alive in a flock right now.
 *
 * Folded over the event timeline rather than kept as a column. A stored count would have to be
 * nudged by every death, cull, sale and purchase, and any missed update would leave the farmer
 * looking at a number that quietly disagrees with their own records — the same drift the
 * reminder projection avoids.
 */
export function currentFlockCount(flock: Pick<Flock, 'initialCount'>, events: Pick<FlockEvent, 'type' | 'quantity'>[]): number {
  const change = events.reduce((total, event) => {
    const meta = FLOCK_EVENT_META[event.type];
    const quantity = event.quantity ?? 0;
    if (!meta?.needsQuantity || quantity <= 0) return total;
    return meta.reducesCount ? total - quantity : total + quantity;
  }, 0);
  // Never below zero: a miskeyed death count should not render a negative flock.
  return Math.max(0, flock.initialCount + change);
}

/** Birds lost to death or culling, as a share of the flock that ever existed. */
export function mortalityRate(
  flock: Pick<Flock, 'initialCount'>,
  events: Pick<FlockEvent, 'type' | 'quantity'>[],
): number {
  const purchased = events
    .filter((event) => event.type === 'purchase')
    .reduce((total, event) => total + (event.quantity ?? 0), 0);
  const everHeld = flock.initialCount + purchased;
  if (everHeld <= 0) return 0;

  const lost = events
    .filter((event) => event.type === 'mortality' || event.type === 'cull')
    .reduce((total, event) => total + (event.quantity ?? 0), 0);
  return (lost / everHeld) * 100;
}

export function countByType(events: Pick<FlockEvent, 'type' | 'quantity'>[], type: FlockEvent['type']): number {
  return events.filter((event) => event.type === type).reduce((total, event) => total + (event.quantity ?? 0), 0);
}
