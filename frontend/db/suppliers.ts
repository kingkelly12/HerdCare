import type { Expense, SupplierPayment } from './schema';

/**
 * What is still owed on a supplier's account.
 *
 * Bills are the expenses tagged to that supplier — the cost was already booked when the goods
 * were taken — and payments are what has since been handed over. Positive means the farmer still
 * owes; negative means they are in credit with the shop.
 */
export function supplierBalance(
  bills: Pick<Expense, 'amount'>[],
  payments: Pick<SupplierPayment, 'amount'>[],
): number {
  return totalBilled(bills) - totalSettled(payments);
}

export function totalBilled(bills: Pick<Expense, 'amount'>[]): number {
  return bills.reduce((sum, bill) => sum + bill.amount, 0);
}

export function totalSettled(payments: Pick<SupplierPayment, 'amount'>[]): number {
  return payments.reduce((sum, payment) => sum + payment.amount, 0);
}
