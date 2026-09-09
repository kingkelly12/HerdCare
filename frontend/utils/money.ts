/**
 * Money formatting.
 *
 * Deliberately hand-rolled rather than `Intl.NumberFormat` with `style: 'currency'`: that path
 * depends on the ICU data built into the device's JS engine, which is exactly the thing that
 * varies on the budget Android handsets this app targets. Grouping digits by hand always renders
 * the same number on every phone.
 */
export function formatMoney(amount: number, currency = 'KES'): string {
  const negative = amount < 0;
  const [whole, decimals] = Math.abs(amount).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${currency} ${grouped}.${decimals}`;
}

/** Litres, shown to one decimal — the precision a farmer actually measures in. */
export function formatLitres(litres: number): string {
  return `${Math.round(litres * 10) / 10} L`;
}
