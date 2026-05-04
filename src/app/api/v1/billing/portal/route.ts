import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import { getStripeClient, isBillingConfigured, StripeNotConfiguredError } from '@/server/billing/stripe';
import { getSubscriptionForUser } from '@/server/billing/subscriptions';

/**
 * POST /api/v1/billing/portal — open the Stripe Customer Portal.
 *
 * Stripe handles all subscription management (cancel, swap plan,
 * update card, view invoices) inside their hosted portal. We just
 * generate the session URL and return it for the client to redirect.
 *
 * The user must have an existing customer record. If they've never
 * subscribed, returns a 400 prompting them to subscribe first.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'billing-portal', RATE_LIMITS.write);
  if (limited) return limited;

  if (!isBillingConfigured()) {
    return NextResponse.json(
      { error: 'Billing is not configured on this deployment.' },
      { status: 503 },
    );
  }

  const sub = await getSubscriptionForUser(userId);
  if (!sub.stripeCustomerId) {
    return NextResponse.json(
      { error: 'No subscription on file. Subscribe first.' },
      { status: 400 },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_URL || new URL(req.url).origin;
  const returnUrl = `${baseUrl}/app/settings/billing`;

  try {
    const stripe = getStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: returnUrl,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error('[billing-portal]', err);
    const msg = err instanceof Error ? err.message : 'Failed to create portal session';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
