/**
 * Subscription state — read/write helpers around the `subscriptions`
 * table. All reads guarantee a row exists for the user (returning a
 * default 'free' record if no subscription has been recorded yet),
 * so callers don't have to handle the empty case.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { type Tier, getTierQuota } from './tiers';

export interface UserSubscription {
  userId: string;
  tier: Tier;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

interface SubscriptionRow {
  user_id: string;
  tier: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_start: string | Date | null;
  current_period_end: string | Date | null;
  cancel_at_period_end: number | boolean | null;
}

export async function getSubscriptionForUser(userId: string): Promise<UserSubscription> {
  const rows = (await db.execute(sql`
    SELECT user_id, tier, status, stripe_customer_id, stripe_subscription_id,
      current_period_start, current_period_end, cancel_at_period_end
    FROM subscriptions
    WHERE user_id = ${userId}::uuid
    LIMIT 1
  `)) as unknown as SubscriptionRow[];

  const row = rows[0];
  if (!row) {
    return {
      userId,
      tier: 'free',
      status: 'active',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
  }

  return {
    userId: row.user_id,
    tier: row.tier as Tier,
    status: row.status,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    currentPeriodStart: row.current_period_start ? new Date(row.current_period_start) : null,
    currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end) : null,
    cancelAtPeriodEnd: !!row.cancel_at_period_end,
  };
}

/**
 * Upsert the local subscription record from a Stripe webhook event.
 * Idempotent — the same event can be processed multiple times safely
 * (Stripe retries failed webhooks) and only the most recent state wins.
 */
export async function upsertSubscriptionFromStripe(input: {
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  tier: Tier;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO subscriptions (
      user_id, stripe_customer_id, stripe_subscription_id,
      tier, status, current_period_start, current_period_end,
      cancel_at_period_end, updated_at
    )
    VALUES (
      ${input.userId}::uuid,
      ${input.stripeCustomerId},
      ${input.stripeSubscriptionId},
      ${input.tier},
      ${input.status},
      ${input.currentPeriodStart},
      ${input.currentPeriodEnd},
      ${input.cancelAtPeriodEnd ? 1 : 0},
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      tier = EXCLUDED.tier,
      status = EXCLUDED.status,
      current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end,
      cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      updated_at = NOW()
  `);
}

/**
 * Find the user_id that a Stripe customer belongs to. Used by the
 * webhook to route events when only the customer id is known.
 */
export async function userIdForStripeCustomer(customerId: string): Promise<string | null> {
  const rows = (await db.execute(sql`
    SELECT user_id FROM subscriptions WHERE stripe_customer_id = ${customerId} LIMIT 1
  `)) as unknown as Array<{ user_id: string }>;
  return rows[0]?.user_id ?? null;
}

/**
 * Get the active tier for a user — a thin shortcut that doesn't
 * require the caller to think about subscription rows or status.
 * Returns 'free' for users who have never subscribed AND for users
 * whose subscription is past_due / canceled / incomplete.
 */
export async function getActiveTier(userId: string): Promise<Tier> {
  const sub = await getSubscriptionForUser(userId);
  if (sub.status !== 'active' && sub.status !== 'trialing') return 'free';
  return sub.tier;
}

/** Convenience: read tier and quota in a single call. */
export async function getActiveTierWithQuota(userId: string) {
  const tier = await getActiveTier(userId);
  return { tier, quota: getTierQuota(tier) };
}
