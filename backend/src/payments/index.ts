import type { Env } from '../types';
import type { PaymentProvider } from './types';
import { createDaraja } from './daraja';

export * from './types';
export { darajaTimestamp, stkPassword } from './daraja';

/**
 * Builds the Daraja client from the Worker's secrets.
 *
 * There is one provider. The small indirection through `PaymentProvider` earns its keep anyway,
 * because it is what keeps the callback rules in `types.ts` free of Safaricom's field names, and
 * those rules are the ones standing between a forged callback and a free subscription.
 */
export function getPaymentProvider(env: Env): PaymentProvider {
  return createDaraja({
    consumerKey: env.MPESA_CONSUMER_KEY,
    consumerSecret: env.MPESA_CONSUMER_SECRET,
    shortCode: env.MPESA_SHORTCODE,
    shortCodeType: env.MPESA_SHORTCODE_TYPE,
    passKey: env.MPESA_PASSKEY,
    environment: env.MPESA_ENVIRONMENT,
  });
}
