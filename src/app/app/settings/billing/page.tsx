'use client';

import { useState, useEffect, useCallback } from 'react';
import { CreditCard, Loader2, AlertTriangle, ArrowUpRight, Check, ExternalLink, Sparkles } from 'lucide-react';
import { PageTransition } from '@/components/PageTransition';
import { usePageTitle } from '@/lib/use-page-title';

interface BillingData {
  billingEnabled: boolean;
  subscription: {
    tier: 'free' | 'personal' | 'pro' | 'lifetime';
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    hasStripeCustomer: boolean;
  };
  quota: {
    label: string;
    monthlyUsd: number;
    maxMemories: number;
    maxBundledTokensPerMonth: number;
    maxEmbeddingTokensPerMonth: number;
    maxAttachmentsMb: number;
    canPublishMinds: boolean;
    oracleEnabled: boolean;
    backupRetentionDays: number;
  };
  usage: {
    monthKey: string;
    tokensIn: number;
    tokensOut: number;
    embeddingTokens: number;
    requests: number;
    costUsd: number;
    pctOfChatLimit: number;
    pctOfEmbeddingLimit: number;
  };
}

const TIER_RANK: Record<string, number> = { free: 0, personal: 1, pro: 2, lifetime: 3 };

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

export default function BillingPage() {
  usePageTitle('Billing');

  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/billing/me');
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCheckout(tier: 'personal' | 'pro') {
    setActionLoading(tier);
    try {
      const res = await fetch('/api/v1/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
      const body = await res.json();
      if (!res.ok || !body.url) throw new Error(body.error || 'Checkout failed');
      window.location.href = body.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setActionLoading(null);
    }
  }

  async function handleManage() {
    setActionLoading('portal');
    try {
      const res = await fetch('/api/v1/billing/portal', { method: 'POST' });
      const body = await res.json();
      if (!res.ok || !body.url) throw new Error(body.error || 'Could not open portal');
      window.location.href = body.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-5 h-5 text-teal-400 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20 text-sm text-red-400">
        {error || 'Could not load billing.'}
      </div>
    );
  }

  if (!data.billingEnabled) {
    return (
      <PageTransition>
        <div className="space-y-5 max-w-3xl">
          <div>
            <h1 className="text-[22px] md:text-[28px] font-semibold tracking-[-0.03em]">Billing</h1>
            <p className="text-[13px] text-zinc-500 mt-0.5">Subscription state for this MindStore deployment.</p>
          </div>
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-2">
            <div className="flex items-center gap-2 text-zinc-200 font-semibold">
              <Sparkles className="w-4 h-4 text-teal-400" />
              Self-hosted deployment
            </div>
            <p className="text-sm text-zinc-400">
              This deployment doesn&apos;t have Stripe configured, so billing is disabled. You&apos;re running MindStore on your own
              infrastructure with full feature access. To enable subscription billing, set <code className="px-1 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">STRIPE_SECRET_KEY</code> and the related env vars per the deployment guide.
            </p>
          </div>
        </div>
      </PageTransition>
    );
  }

  const sub = data.subscription;
  const quota = data.quota;
  const usage = data.usage;

  const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const currentRank = TIER_RANK[sub.tier] ?? 0;

  return (
    <PageTransition>
      <div className="space-y-6 md:space-y-8 max-w-4xl">
        {/* ─── Header ──────────────────────────── */}
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-teal-400" />
            </div>
            <h1 className="text-[22px] md:text-[28px] font-semibold tracking-[-0.03em]">Billing</h1>
          </div>
          <p className="text-[13px] text-zinc-500 mt-3">
            Your subscription, AI usage this month, and the upgrade path. Cancel any time — your data stays.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20 flex items-center gap-2 text-sm text-red-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* ─── Current plan ──────────────────────── */}
        <section className="p-5 md:p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs text-zinc-500">Current plan</div>
              <div className="mt-1 flex items-baseline gap-2">
                <h2 className="text-2xl font-semibold text-white">{quota.label}</h2>
                {quota.monthlyUsd > 0 && (
                  <span className="text-sm text-zinc-500">${quota.monthlyUsd}/month</span>
                )}
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  sub.status === 'active' || sub.status === 'trialing'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}>
                  {sub.status}
                </span>
              </div>
              {periodEnd && (
                <p className="text-xs text-zinc-500 mt-1">
                  {sub.cancelAtPeriodEnd
                    ? `Cancels on ${periodEnd.toLocaleDateString()}`
                    : `Renews on ${periodEnd.toLocaleDateString()}`}
                </p>
              )}
            </div>

            {sub.hasStripeCustomer && (
              <button
                onClick={handleManage}
                disabled={actionLoading === 'portal'}
                className="px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-zinc-200 hover:bg-white/[0.06] transition-colors text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
              >
                {actionLoading === 'portal' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4" />
                )}
                Manage subscription
              </button>
            )}
          </div>
        </section>

        {/* ─── Usage this month ──────────────────── */}
        <section className="p-5 md:p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-5">
          <div>
            <h2 className="text-base font-semibold text-white">Usage this month</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {usage.monthKey} · gateway only — BYO-key usage isn&apos;t billed by us.
            </p>
          </div>

          <UsageBar
            label="Bundled chat tokens"
            used={usage.tokensIn + usage.tokensOut}
            limit={quota.maxBundledTokensPerMonth}
            pct={usage.pctOfChatLimit}
          />
          <UsageBar
            label="Embedding tokens"
            used={usage.embeddingTokens}
            limit={quota.maxEmbeddingTokensPerMonth}
            pct={usage.pctOfEmbeddingLimit}
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-white/[0.04]">
            <UsageStat label="Requests" value={fmtNum(usage.requests)} />
            <UsageStat label="Tokens in" value={fmtNum(usage.tokensIn)} />
            <UsageStat label="Tokens out" value={fmtNum(usage.tokensOut)} />
            <UsageStat label="Cost (gateway)" value={`$${usage.costUsd.toFixed(2)}`} />
          </div>
        </section>

        {/* ─── Upgrade options ──────────────────── */}
        {currentRank < TIER_RANK.pro && (
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-white">Upgrade</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentRank < TIER_RANK.personal && (
                <UpgradeCard
                  tier="personal"
                  label="Personal"
                  price="$12/month"
                  blurb="10k memories, 1.5M bundled tokens/mo, all Phase 2 innovations."
                  onClick={() => handleCheckout('personal')}
                  loading={actionLoading === 'personal'}
                />
              )}
              {currentRank < TIER_RANK.pro && (
                <UpgradeCard
                  tier="pro"
                  label="Pro"
                  price="$29/month"
                  blurb="100k memories, 6M tokens/mo, Knowledge Oracle, Mind Marketplace."
                  onClick={() => handleCheckout('pro')}
                  loading={actionLoading === 'pro'}
                  highlight
                />
              )}
            </div>
          </section>
        )}

        {/* ─── Switch to BYO key ──────────────────── */}
        <section className="p-5 md:p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-2">
          <h2 className="text-base font-semibold text-white">Want to save more?</h2>
          <p className="text-sm text-zinc-400">
            Bring your own provider key (OpenAI, Anthropic, Gemini, OpenRouter, Ollama) to skip the bundled
            token quotas — your subscription becomes a flat platform fee. Set <code className="px-1 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-xs">chat_provider</code> to your provider name in
            Settings → Connect AI.
          </p>
          <a
            href="/app/connect"
            className="inline-flex items-center gap-1 mt-1 text-sm text-teal-400 hover:text-teal-300 transition-colors"
          >
            Open Connect AI <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </section>
      </div>
    </PageTransition>
  );
}

function UsageBar({ label, used, limit, pct }: { label: string; used: number; limit: number; pct: number }) {
  const overCap = limit > 0 && used >= limit;
  const barColor = overCap ? 'bg-red-500' : pct > 80 ? 'bg-amber-400' : 'bg-teal-400';
  const displayPct = limit === -1 ? 0 : Math.min(pct, 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-300">{label}</span>
        <span className="text-zinc-500 font-mono">
          {fmtNum(used)} / {limit === -1 ? '∞' : limit === 0 ? 'BYO key only' : fmtNum(limit)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all`}
          style={{ width: `${displayPct}%` }}
        />
      </div>
      {overCap && (
        <p className="text-[11px] text-red-400">
          You&apos;ve hit your monthly cap. Upgrade or switch to BYO key to keep using bundled AI.
        </p>
      )}
    </div>
  );
}

function UsageStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-lg font-semibold text-zinc-200 tabular-nums">{value}</div>
    </div>
  );
}

function UpgradeCard({
  tier, label, price, blurb, onClick, loading, highlight,
}: {
  tier: 'personal' | 'pro';
  label: string;
  price: string;
  blurb: string;
  onClick: () => void;
  loading: boolean;
  highlight?: boolean;
}) {
  void tier;
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`text-left p-5 rounded-2xl transition-all ${
        highlight
          ? 'bg-teal-500/[0.04] border-2 border-teal-500/30 hover:border-teal-500/50'
          : 'bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.1]'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-semibold text-white">{label}</h3>
        <span className={`text-sm ${highlight ? 'text-teal-400' : 'text-zinc-400'}`}>{price}</span>
      </div>
      <p className="text-xs text-zinc-400 mt-1.5">{blurb}</p>
      <div className="mt-3 flex items-center gap-1.5 text-xs font-medium">
        {loading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Opening Stripe…
          </>
        ) : (
          <>
            <Check className={highlight ? 'w-3.5 h-3.5 text-teal-400' : 'w-3.5 h-3.5 text-zinc-400'} />
            <span className={highlight ? 'text-teal-400' : 'text-zinc-300'}>Upgrade →</span>
          </>
        )}
      </div>
    </button>
  );
}
