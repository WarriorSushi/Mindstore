import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/api-validation';
import { getSubscriptionForUser } from '@/server/billing/subscriptions';
import { getTierQuota } from '@/server/billing/tiers';
import { getUsageSummary } from '@/server/billing/usage';
import { isBillingConfigured } from '@/server/billing/stripe';

/**
 * GET /api/v1/billing/me — current user's subscription + usage.
 *
 * Returns the same shape regardless of whether Stripe is configured;
 * unconfigured deployments report tier='free' with `billingEnabled: false`
 * so the UI can hide upgrade prompts gracefully on self-hosted setups.
 */
export async function GET() {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const sub = await getSubscriptionForUser(userId);
  const quota = getTierQuota(sub.tier);
  const usage = await getUsageSummary(userId);

  return NextResponse.json({
    billingEnabled: isBillingConfigured(),
    subscription: {
      tier: sub.tier,
      status: sub.status,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      hasStripeCustomer: !!sub.stripeCustomerId,
    },
    quota,
    usage: {
      monthKey: usage.monthKey,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      embeddingTokens: usage.embeddingTokens,
      requests: usage.requests,
      costUsd: usage.costMicros / 1_000_000,
      pctOfChatLimit: quota.maxBundledTokensPerMonth > 0
        ? Math.round(((usage.tokensIn + usage.tokensOut) / quota.maxBundledTokensPerMonth) * 100)
        : 0,
      pctOfEmbeddingLimit: quota.maxEmbeddingTokensPerMonth > 0
        ? Math.round((usage.embeddingTokens / quota.maxEmbeddingTokensPerMonth) * 100)
        : 0,
    },
  });
}
