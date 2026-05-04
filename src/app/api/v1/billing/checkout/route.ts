import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { parseJsonBody, requireUserId } from '@/server/api-validation';
import { getStripeClient, isBillingFullyConfigured, StripeNotConfiguredError } from '@/server/billing/stripe';
import { stripePriceIdForTier, type Tier } from '@/server/billing/tiers';
import { getSubscriptionForUser } from '@/server/billing/subscriptions';

const CheckoutSchema = z.object({
  tier: z.enum(['personal', 'pro']),
  returnUrl: z.string().url().optional(),
});

/**
 * POST /api/v1/billing/checkout — create a Stripe Checkout Session.
 *
 * If the user already has a Stripe customer (they've subscribed before),
 * the session is created with that customer attached. Otherwise Stripe
 * creates a fresh customer at checkout time and the webhook ties it
 * back to the user via `client_reference_id`.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'billing-checkout', RATE_LIMITS.write);
  if (limited) return limited;

  if (!isBillingFullyConfigured()) {
    return NextResponse.json(
      { error: 'Billing is not configured on this deployment. Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PERSONAL, and STRIPE_PRICE_PRO.' },
      { status: 503 },
    );
  }

  const body = await parseJsonBody(req, CheckoutSchema);
  if (body instanceof NextResponse) return body;

  const priceId = stripePriceIdForTier(body.tier as Tier);
  if (!priceId) {
    return NextResponse.json({ error: 'No Stripe price configured for this tier' }, { status: 503 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_URL || new URL(req.url).origin;
  const successUrl = `${baseUrl}/app/settings/billing?checkout=success`;
  const cancelUrl = body.returnUrl || `${baseUrl}/pricing?checkout=cancel`;

  try {
    const stripe = getStripeClient();
    const sub = await getSubscriptionForUser(userId);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      // Reuse existing customer when present so receipts roll up under one record.
      customer: sub.stripeCustomerId || undefined,
      // Without an existing customer we let Stripe create one and email-collect.
      ...(sub.stripeCustomerId ? {} : { customer_creation: 'always' as const }),
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { userId, tier: body.tier },
      },
      metadata: { userId, tier: body.tier },
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error('[billing-checkout]', err);
    const msg = err instanceof Error ? err.message : 'Failed to create checkout session';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
