import Link from 'next/link';
import { Brain, Check, X } from 'lucide-react';
import { TIER_QUOTAS } from '@/server/billing/tiers';

export const metadata = {
  title: 'Pricing — MindStore',
  description: 'Your second brain, in every AI tool you use. Free self-host, $12/month hosted, $29/month pro.',
};

interface TierCard {
  slug: 'free' | 'personal' | 'pro';
  highlight?: boolean;
  blurb: string;
  features: string[];
  cta: { label: string; href: string };
}

function fmtMemories(n: number) {
  if (n === -1) return 'Unlimited';
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return n.toString();
}

function fmtTokens(n: number) {
  if (n === -1) return 'Unlimited';
  if (n === 0) return 'BYO key';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M tokens/mo`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k tokens/mo`;
  return `${n} tokens/mo`;
}

function fmtAttachments(mb: number) {
  if (mb >= 1000) return `${(mb / 1000).toFixed(0)}GB`;
  return `${mb}MB`;
}

const TIERS: TierCard[] = [
  {
    slug: 'free',
    blurb: 'Try MindStore free, or self-host the open-source release on your own server forever.',
    features: [
      `${fmtMemories(TIER_QUOTAS.free.maxMemories)} memories`,
      `${fmtAttachments(TIER_QUOTAS.free.maxAttachmentsMb)} attachments`,
      'BYO API keys (OpenAI, Gemini, Ollama, OpenRouter)',
      'All 35 import plugins',
      'MCP server (plug into Claude, Cursor, Codex)',
      'Portable .mind file export',
      'Self-host: full source under FSL-1.1-MIT',
    ],
    cta: { label: 'Sign up free', href: '/login' },
  },
  {
    slug: 'personal',
    highlight: true,
    blurb: 'Hosted MindStore with bundled AI. The "I just want it to work" tier.',
    features: [
      `${fmtMemories(TIER_QUOTAS.personal.maxMemories)} memories`,
      `${fmtAttachments(TIER_QUOTAS.personal.maxAttachmentsMb)} attachments`,
      `${fmtTokens(TIER_QUOTAS.personal.maxBundledTokensPerMonth)} of bundled chat`,
      `${fmtTokens(TIER_QUOTAS.personal.maxEmbeddingTokensPerMonth)} of embeddings`,
      'BYO key still works (skip bundled, save more)',
      'All Phase 2 innovations (Fingerprint, Mind Diff, Forgetting Curve, Adversarial Retrieval)',
      'MCP server with all 7 tools',
      `${TIER_QUOTAS.personal.backupRetentionDays}-day backup history`,
    ],
    cta: { label: 'Subscribe — $12/mo', href: '/login?upgrade=personal' },
  },
  {
    slug: 'pro',
    blurb: 'For power users and people whose second brain runs at scale.',
    features: [
      `${fmtMemories(TIER_QUOTAS.pro.maxMemories)} memories`,
      `${fmtAttachments(TIER_QUOTAS.pro.maxAttachmentsMb)} attachments`,
      `${fmtTokens(TIER_QUOTAS.pro.maxBundledTokensPerMonth)} of bundled chat`,
      `${fmtTokens(TIER_QUOTAS.pro.maxEmbeddingTokensPerMonth)} of embeddings`,
      'Knowledge Oracle (deep multi-turn reasoning over your base)',
      'Mind Marketplace publish access',
      `${TIER_QUOTAS.pro.backupRetentionDays}-day backup history`,
      'Priority email support',
    ],
    cta: { label: 'Subscribe — $29/mo', href: '/login?upgrade=pro' },
  },
];

const FAQ = [
  {
    q: 'What\'s the difference between bundled AI and BYO key?',
    a: 'In bundled mode, MindStore handles the LLM provider — your subscription includes a token allowance, you don\'t need an OpenAI/Anthropic account. In BYO key mode, you paste your own provider key into Settings and your subscription is just for the platform. Power users save money with BYO; casual users skip the setup with bundled. You can switch any time.',
  },
  {
    q: 'Can I bring my own AI provider key?',
    a: 'Yes — every tier supports BYO key. Paste your OpenAI / Anthropic / Gemini / Ollama / OpenRouter / custom-OpenAI-compatible key into Settings and MindStore uses that instead of the bundled tokens. Your usage is then billed by your provider directly. You still pay us the platform fee.',
  },
  {
    q: 'Can I self-host instead?',
    a: 'Absolutely. The full source is open under FSL-1.1-MIT — clone the repo, run `npm install && npm run migrate && npm run dev`, and you have your own MindStore on your own server. Bring your own database (Postgres + pgvector — Neon, Supabase, Railway, or self-hosted), your own AI keys, and your data never touches us. You can also export a .mind file from the cloud and import it into a self-hosted instance, or vice versa.',
  },
  {
    q: 'What\'s a .mind file?',
    a: 'Your entire knowledge base packaged as a single ZIP — memories, embeddings, tree index, connections, profile, manifest. Move it between cloud and self-host, share it (carefully), or back it up. Available on every tier including free.',
  },
  {
    q: 'How does the MCP integration work?',
    a: 'MindStore exposes seven tools (search_mind, get_context, get_profile, get_timeline, get_contradictions, get_threads, learn_fact) through the Model Context Protocol. Plug it into Claude Desktop, Claude Code, Cursor, Codex, Cline, or Continue, and the AI tool you already use can search, contradict, and write to your knowledge base. The /app/mcp-setup page generates the config snippets for each client.',
  },
  {
    q: 'What if I exceed my monthly token cap?',
    a: 'You stay logged in and your data stays exactly as it is. Bundled-AI calls return a friendly message inviting you to upgrade or switch to BYO key. Search, import, plugins that don\'t need AI — all keep working. The cap resets at the start of the next billing period.',
  },
  {
    q: 'Can I cancel any time?',
    a: 'Yes. Cancellation takes effect at the end of your current billing period — you keep all the features until then. After that you fall back to free tier (your data stays; some quotas tighten). No refunds for partial months. Self-host is always a backup option if you want to keep using everything.',
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-zinc-200 hover:text-white transition-colors">
            <Brain className="w-5 h-5 text-teal-400" />
            MindStore
          </Link>
          <nav className="flex items-center gap-5 text-sm text-zinc-400">
            <Link href="/docs" className="hover:text-zinc-200 transition-colors">Docs</Link>
            <Link href="/login" className="hover:text-zinc-200 transition-colors">Log in</Link>
            <Link
              href="/login"
              className="px-3 py-1.5 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400 hover:bg-teal-500/20 transition-colors text-sm font-medium"
            >
              Sign up free
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-12 md:py-20">
        {/* Hero */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-[-0.03em] mb-4">
            Your second brain, plugged into every AI tool you use.
          </h1>
          <p className="text-lg text-zinc-400">
            Free to self-host. $12/month if you'd rather we run it. Bring your own AI keys or use ours — both work on every paid tier.
          </p>
        </div>

        {/* Tier cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 mb-20">
          {TIERS.map((tier) => {
            const quota = TIER_QUOTAS[tier.slug];
            return (
              <div
                key={tier.slug}
                className={
                  tier.highlight
                    ? 'rounded-2xl border-2 border-teal-500/40 bg-teal-500/[0.03] p-6 md:p-7 relative'
                    : 'rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 md:p-7'
                }
              >
                {tier.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-teal-500 text-zinc-950 text-xs font-semibold">
                    Most popular
                  </div>
                )}
                <h3 className="text-lg font-semibold text-white">{quota.label}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold tracking-tight text-white">
                    ${quota.monthlyUsd}
                  </span>
                  {quota.monthlyUsd > 0 && <span className="text-sm text-zinc-500">/month</span>}
                </div>
                <p className="text-sm text-zinc-400 mt-2">{tier.blurb}</p>

                <ul className="mt-5 space-y-2 text-sm">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                      <span className="text-zinc-300">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={tier.cta.href}
                  className={
                    tier.highlight
                      ? 'mt-6 block w-full py-2.5 rounded-xl bg-teal-500 text-zinc-950 font-semibold text-center hover:bg-teal-400 transition-colors'
                      : 'mt-6 block w-full py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-zinc-200 font-medium text-center hover:bg-white/[0.06] transition-colors'
                  }
                >
                  {tier.cta.label}
                </Link>
              </div>
            );
          })}
        </div>

        {/* Comparison table */}
        <section className="mb-20">
          <h2 className="text-xl font-semibold text-white mb-5">Compare features</h2>
          <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-white/[0.02]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.04] text-zinc-400">
                  <th className="text-left px-5 py-3 font-medium">Feature</th>
                  <th className="text-center px-5 py-3 font-medium">Free</th>
                  <th className="text-center px-5 py-3 font-medium">Personal</th>
                  <th className="text-center px-5 py-3 font-medium">Pro</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {[
                  ['Memory limit', fmtMemories(TIER_QUOTAS.free.maxMemories), fmtMemories(TIER_QUOTAS.personal.maxMemories), fmtMemories(TIER_QUOTAS.pro.maxMemories)],
                  ['Bundled AI tokens', fmtTokens(TIER_QUOTAS.free.maxBundledTokensPerMonth), fmtTokens(TIER_QUOTAS.personal.maxBundledTokensPerMonth), fmtTokens(TIER_QUOTAS.pro.maxBundledTokensPerMonth)],
                  ['Embedding tokens', fmtTokens(TIER_QUOTAS.free.maxEmbeddingTokensPerMonth), fmtTokens(TIER_QUOTAS.personal.maxEmbeddingTokensPerMonth), fmtTokens(TIER_QUOTAS.pro.maxEmbeddingTokensPerMonth)],
                  ['Attachment storage', fmtAttachments(TIER_QUOTAS.free.maxAttachmentsMb), fmtAttachments(TIER_QUOTAS.personal.maxAttachmentsMb), fmtAttachments(TIER_QUOTAS.pro.maxAttachmentsMb)],
                  ['Backup retention', `${TIER_QUOTAS.free.backupRetentionDays} days`, `${TIER_QUOTAS.personal.backupRetentionDays} days`, `${TIER_QUOTAS.pro.backupRetentionDays} days`],
                ].map(([label, a, b, c]) => (
                  <tr key={label} className="border-b border-white/[0.03] last:border-0">
                    <td className="px-5 py-3">{label}</td>
                    <td className="px-5 py-3 text-center">{a}</td>
                    <td className="px-5 py-3 text-center">{b}</td>
                    <td className="px-5 py-3 text-center">{c}</td>
                  </tr>
                ))}
                <FeatureRow label="MCP server (Claude / Cursor / Codex / etc.)" free pers pro />
                <FeatureRow label="All 35 import plugins" free pers pro />
                <FeatureRow label="Portable .mind file" free pers pro />
                <FeatureRow label="BYO API keys" free pers pro />
                <FeatureRow label="Knowledge Oracle (deep reasoning)" pro />
                <FeatureRow label="Mind Marketplace publish access" pro />
                <FeatureRow label="Priority support" pro />
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="text-xl font-semibold text-white mb-5">Frequently asked</h2>
          <div className="space-y-4">
            {FAQ.map((item) => (
              <details key={item.q} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4 group">
                <summary className="cursor-pointer font-medium text-zinc-200 hover:text-white list-none flex items-center justify-between gap-3">
                  {item.q}
                  <span className="text-zinc-500 group-open:rotate-180 transition-transform shrink-0">▾</span>
                </summary>
                <p className="mt-3 text-sm text-zinc-400 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.04] mt-16">
        <div className="max-w-6xl mx-auto px-4 py-8 text-sm text-zinc-500 flex flex-wrap items-center justify-between gap-4">
          <div>© {new Date().getFullYear()} MindStore. Open source under FSL-1.1-MIT.</div>
          <div className="flex gap-5">
            <Link href="/docs" className="hover:text-zinc-300 transition-colors">Docs</Link>
            <Link href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-zinc-300 transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureRow({ label, free, pers, pro }: { label: string; free?: boolean; pers?: boolean; pro?: boolean }) {
  const cell = (on?: boolean) =>
    on ? <Check className="w-4 h-4 text-teal-400 mx-auto" /> : <X className="w-4 h-4 text-zinc-700 mx-auto" />;
  return (
    <tr className="border-b border-white/[0.03] last:border-0">
      <td className="px-5 py-3">{label}</td>
      <td className="px-5 py-3 text-center">{cell(free)}</td>
      <td className="px-5 py-3 text-center">{cell(pers)}</td>
      <td className="px-5 py-3 text-center">{cell(pro)}</td>
    </tr>
  );
}
