import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripeClient, StripeNotConfiguredError } from '@/server/billing/stripe';
import { upsertSubscriptionFromStripe, userIdForStripeCustomer } from '@/server/billing/subscriptions';
import { tierFromStripePriceId } from '@/server/billing/tiers';

/**
 * POST /api/v1/billing/webhook — Stripe webhook receiver.
 *
 * Verifies the signature using STRIPE_WEBHOOK_SECRET, then handles
 * the four events that change a user's subscription state:
 *
 *   - checkout.session.completed         (first subscription)
 *   - customer.subscription.created      (defensive duplicate of above)
 *   - customer.subscription.updated      (plan swap, card update, etc.)
 *   - customer.subscription.deleted      (cancellation took effect)
 *
 * Stripe retries failed webhooks; the upserts are idempotent so
 * re-processing the same event is safe. We always 200 once we've
 * decoded the event, even if our DB update partially fails — Stripe
 * doesn't need to retry on transient downstream errors that we'll
 * reconcile on the next event anyway.
 *
 * NOT auth-gated by `requireUserId` — Stripe doesn't carry a user
 * session. Instead the signature is the auth.
 */
export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !webhookSecret) {
    return NextResponse.json(
      { error: 'Webhook signature or secret missing' },
      { status: 400 },
    );
  }

  const rawBody = await req.text();
  let event: Stripe.Event;

  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const msg = err instanceof Error ? err.message : 'Invalid signature';
    return NextResponse.json({ error: `Webhook signature verification failed: ${msg}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break;

        const userId = (session.client_reference_id || session.metadata?.userId) as string | null;
        if (!userId) {
          console.error('[stripe-webhook] checkout.session.completed missing userId', session.id);
          break;
        }
        if (!session.subscription || !session.customer) break;

        const stripe = getStripeClient();
        const sub = typeof session.subscription === 'string'
          ? await stripe.subscriptions.retrieve(session.subscription)
          : session.subscription;

        await upsertFromSubscription(sub, userId, session.customer as string);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

        // Prefer userId in metadata (set at checkout time), fall back to
        // looking up by stripe_customer_id we recorded earlier.
        let userId: string | null = (sub.metadata?.userId as string | undefined) ?? null;
        if (!userId) userId = await userIdForStripeCustomer(customerId);
        if (!userId) {
          console.error('[stripe-webhook] could not resolve userId for subscription', sub.id);
          break;
        }

        await upsertFromSubscription(sub, userId, customerId);
        break;
      }

      default:
        // Other events (invoice paid, payment failed, etc.) are useful
        // for analytics but don't change the tier itself. We accept and
        // ignore them so Stripe stops retrying.
        break;
    }
  } catch (err) {
    // Log + still return 2xx so Stripe doesn't retry indefinitely. The
    // next event from Stripe will reconcile state.
    console.error('[stripe-webhook] handler failed', event.type, err);
    return NextResponse.json({ received: true, handlerError: true });
  }

  return NextResponse.json({ received: true });
}

async function upsertFromSubscription(sub: Stripe.Subscription, userId: string, customerId: string) {
  const priceId = sub.items.data[0]?.price.id ?? null;
  const tier = tierFromStripePriceId(priceId);

  // In recent Stripe SDK versions current_period_* moved from
  // Subscription onto each SubscriptionItem. Read from the first item
  // (a subscription with multiple items would need richer logic, but
  // we only ever attach one price per subscription).
  const firstItem = sub.items.data[0];
  const periodStart = firstItem?.current_period_start
    ? new Date(firstItem.current_period_start * 1000)
    : null;
  const periodEnd = firstItem?.current_period_end
    ? new Date(firstItem.current_period_end * 1000)
    : null;

  await upsertSubscriptionFromStripe({
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    tier,
    status: sub.status,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
  });
}
