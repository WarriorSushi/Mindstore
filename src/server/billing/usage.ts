/**
 * Per-user usage tracking — token + request counts written to the
 * `usage_records` table, aggregated per (user, month, kind, provider).
 *
 * Used by:
 *   - The bundled-AI mode to enforce per-tier monthly caps before each
 *     LLM call (`checkBundledQuotaOk`)
 *   - The /app/settings/billing page to show the user how close they
 *     are to their cap (`getUsageSummary`)
 *   - The webhook + cron logic (future) to roll up monthly costs for
 *     ledger reconciliation
 *
 * The amount column is stored as TEXT because BIGINT round-trips
 * through some pg drivers as strings anyway, and integer addition in
 * SQL handles both. CAST to BIGINT happens inside SQL, never on the
 * Node side, to avoid the 2^53 precision ceiling.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { currentMonthKey, getTierQuota } from './tiers';
import { getActiveTier } from './subscriptions';

export type UsageKind = 'tokens-in' | 'tokens-out' | 'embedding-tokens' | 'requests';

export interface UsageDelta {
  userId: string;
  kind: UsageKind;
  provider?: string;
  amount: number;
  costMicros?: number;
}

/**
 * Record usage. Idempotent under the (user, month, kind, provider)
 * key — multiple concurrent calls to the same (user,month,kind,provider)
 * combine via SQL-side addition.
 */
export async function recordUsage(delta: UsageDelta): Promise<void> {
  if (delta.amount <= 0) return;
  const monthKey = currentMonthKey();
  const provider = delta.provider ?? 'gateway';
  const cost = delta.costMicros ?? 0;

  await db.execute(sql`
    INSERT INTO usage_records (user_id, month_key, kind, provider, amount, cost_micros, updated_at)
    VALUES (
      ${delta.userId}::uuid,
      ${monthKey},
      ${delta.kind},
      ${provider},
      ${String(delta.amount)},
      ${String(cost)},
      NOW()
    )
    ON CONFLICT (user_id, month_key, kind, provider) DO UPDATE SET
      amount = (CAST(usage_records.amount AS BIGINT) + ${String(delta.amount)})::TEXT,
      cost_micros = (CAST(usage_records.cost_micros AS BIGINT) + ${String(cost)})::TEXT,
      updated_at = NOW()
  `);
}

export interface MonthlyUsageSummary {
  monthKey: string;
  tokensIn: number;
  tokensOut: number;
  embeddingTokens: number;
  requests: number;
  costMicros: number;
}

/**
 * Per-user, per-month aggregate across the gateway provider only
 * (BYO-key usage isn't billed by us, so it's tracked but not summed
 * into the user's "spend with us" view).
 */
export async function getUsageSummary(userId: string, monthKey = currentMonthKey()): Promise<MonthlyUsageSummary> {
  const rows = (await db.execute(sql`
    SELECT kind, amount, cost_micros
    FROM usage_records
    WHERE user_id = ${userId}::uuid
      AND month_key = ${monthKey}
      AND provider = 'gateway'
  `)) as unknown as Array<{ kind: UsageKind; amount: string; cost_micros: string }>;

  const summary: MonthlyUsageSummary = {
    monthKey,
    tokensIn: 0,
    tokensOut: 0,
    embeddingTokens: 0,
    requests: 0,
    costMicros: 0,
  };

  for (const row of rows) {
    const amount = Number(row.amount);
    summary.costMicros += Number(row.cost_micros);
    if (row.kind === 'tokens-in') summary.tokensIn += amount;
    else if (row.kind === 'tokens-out') summary.tokensOut += amount;
    else if (row.kind === 'embedding-tokens') summary.embeddingTokens += amount;
    else if (row.kind === 'requests') summary.requests += amount;
  }

  return summary;
}

export interface QuotaCheck {
  ok: boolean;
  tier: string;
  used: number;
  limit: number;
  reason?: string;
}

/**
 * Check whether the user can make a bundled-AI call right now.
 *
 *   - Free tier: bundled mode is disabled (limit = 0). Returns ok=false
 *     with reason that points the user at upgrading or BYO key.
 *   - Personal/Pro: returns ok=true while under the monthly cap, then
 *     flips to ok=false with a friendly reason.
 *   - Lifetime: same caps as Pro.
 *
 * `kind` defaults to chat tokens; pass 'embedding-tokens' for
 * embedding gateway calls so they're checked against the embedding
 * cap rather than the chat cap.
 */
export async function checkBundledQuotaOk(
  userId: string,
  kind: 'chat' | 'embedding' = 'chat',
): Promise<QuotaCheck> {
  const tier = await getActiveTier(userId);
  const quota = getTierQuota(tier);
  const summary = await getUsageSummary(userId);

  const used = kind === 'embedding'
    ? summary.embeddingTokens
    : summary.tokensIn + summary.tokensOut;
  const limit = kind === 'embedding'
    ? quota.maxEmbeddingTokensPerMonth
    : quota.maxBundledTokensPerMonth;

  if (limit === -1) {
    return { ok: true, tier, used, limit };
  }
  if (limit === 0) {
    return {
      ok: false,
      tier,
      used,
      limit,
      reason: tier === 'free'
        ? 'Bundled AI is a paid feature. Upgrade to Personal or Pro, or paste your own provider key in Settings.'
        : 'Bundled AI is disabled for this tier.',
    };
  }
  if (used >= limit) {
    return {
      ok: false,
      tier,
      used,
      limit,
      reason: `You've used your ${kind} token allowance for this month (${used.toLocaleString()} / ${limit.toLocaleString()}). Upgrade your tier, wait for the next billing period, or switch to BYO key in Settings.`,
    };
  }
  return { ok: true, tier, used, limit };
}
