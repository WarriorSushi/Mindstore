/**
 * Subscription tier definitions.
 *
 * The actual Stripe Price IDs are set via environment variables —
 * STRIPE_PRICE_PERSONAL and STRIPE_PRICE_PRO — so deployments can
 * swap between test and live prices without code changes.
 *
 * Quotas here are the SERVER-ENFORCED limits. The pricing page may
 * present softer numbers (e.g., "10,000 memories" framed positively
 * vs. the hard cap that backs it).
 */

export type Tier = 'free' | 'personal' | 'pro' | 'lifetime';

export interface TierQuota {
  /** Display name for the tier, surfaced in the UI. */
  label: string;
  /** Monthly price in USD. 0 for free tiers. */
  monthlyUsd: number;
  /** Maximum stored memories. -1 = unlimited. */
  maxMemories: number;
  /** Maximum input + output tokens per month through bundled AI mode. -1 = unlimited (BYO key only path). */
  maxBundledTokensPerMonth: number;
  /** Per-month embedding token cap for bundled AI mode. */
  maxEmbeddingTokensPerMonth: number;
  /** Maximum file storage in MB. */
  maxAttachmentsMb: number;
  /** Whether the user gets MCP marketplace publish access. */
  canPublishMinds: boolean;
  /** Whether the heavy Knowledge Oracle (B.3) is enabled. */
  oracleEnabled: boolean;
  /** Days of backup retention. */
  backupRetentionDays: number;
}

export const TIER_QUOTAS: Record<Tier, TierQuota> = {
  free: {
    label: 'Free',
    monthlyUsd: 0,
    maxMemories: 1_000,
    // Bundled tokens disabled on free; user must BYO key.
    maxBundledTokensPerMonth: 0,
    maxEmbeddingTokensPerMonth: 0,
    maxAttachmentsMb: 100,
    canPublishMinds: false,
    oracleEnabled: false,
    backupRetentionDays: 7,
  },
  personal: {
    label: 'Personal',
    monthlyUsd: 12,
    maxMemories: 10_000,
    // ~$3/mo of Sonnet-class output tokens; the cap exists to keep
    // unit economics positive. Power users will hit this and either
    // upgrade to Pro or switch to BYO key.
    maxBundledTokensPerMonth: 1_500_000,
    maxEmbeddingTokensPerMonth: 5_000_000,
    maxAttachmentsMb: 5_000,
    canPublishMinds: false,
    oracleEnabled: false,
    backupRetentionDays: 30,
  },
  pro: {
    label: 'Pro',
    monthlyUsd: 29,
    // Soft-unlimited: large enough that no realistic personal user hits it.
    maxMemories: 100_000,
    maxBundledTokensPerMonth: 6_000_000,
    maxEmbeddingTokensPerMonth: 20_000_000,
    maxAttachmentsMb: 50_000,
    canPublishMinds: true,
    oracleEnabled: true,
    backupRetentionDays: 90,
  },
  lifetime: {
    // Granted manually for founders / swap deals / press / etc.
    label: 'Lifetime',
    monthlyUsd: 0,
    maxMemories: 100_000,
    maxBundledTokensPerMonth: 6_000_000,
    maxEmbeddingTokensPerMonth: 20_000_000,
    maxAttachmentsMb: 50_000,
    canPublishMinds: true,
    oracleEnabled: true,
    backupRetentionDays: 365,
  },
};

export function getTierQuota(tier: Tier | string | null | undefined): TierQuota {
  if (!tier) return TIER_QUOTAS.free;
  if (tier in TIER_QUOTAS) return TIER_QUOTAS[tier as Tier];
  return TIER_QUOTAS.free;
}

/**
 * Map a Stripe Price ID (env-configured) back to a tier slug.
 * Used by the webhook to translate `subscription.items[0].price.id`
 * into the tier we record.
 */
export function tierFromStripePriceId(priceId: string | null | undefined): Tier {
  if (!priceId) return 'free';
  if (priceId === process.env.STRIPE_PRICE_PERSONAL) return 'personal';
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro';
  return 'free';
}

export function stripePriceIdForTier(tier: Tier): string | null {
  if (tier === 'personal') return process.env.STRIPE_PRICE_PERSONAL ?? null;
  if (tier === 'pro') return process.env.STRIPE_PRICE_PRO ?? null;
  return null;
}

export function currentMonthKey(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
