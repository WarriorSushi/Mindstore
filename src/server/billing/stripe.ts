/**
 * Stripe SDK singleton.
 *
 * The SDK is constructed lazily so that builds and unit tests don't
 * require STRIPE_SECRET_KEY to be set. Routes that genuinely need
 * Stripe call `getStripeClient()` and surface a clear error if the
 * deployment hasn't been configured for billing yet.
 */
import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export class StripeNotConfiguredError extends Error {
  constructor(missing: string) {
    super(`Stripe is not configured: ${missing} is missing. Set the env var to enable billing.`);
    this.name = 'StripeNotConfiguredError';
  }
}

export function getStripeClient(): Stripe {
  if (_stripe) return _stripe;
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new StripeNotConfiguredError('STRIPE_SECRET_KEY');
  _stripe = new Stripe(secret, {
    // Pin the API version so a Stripe-side dashboard upgrade doesn't
    // silently change response shapes under us. Bump intentionally.
    apiVersion: '2025-04-30.basil' as Stripe.LatestApiVersion,
    appInfo: { name: 'mindstore', version: '0.3.0' },
  });
  return _stripe;
}

export function isBillingConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function isBillingFullyConfigured(): boolean {
  return (
    !!process.env.STRIPE_SECRET_KEY &&
    !!process.env.STRIPE_WEBHOOK_SECRET &&
    !!process.env.STRIPE_PRICE_PERSONAL &&
    !!process.env.STRIPE_PRICE_PRO
  );
}
