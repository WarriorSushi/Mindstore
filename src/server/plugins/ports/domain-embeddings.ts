/**
 * Domain-Specific Embeddings — Portable Logic
 *
 * Domain profiles, keyword-based domain detection, and model recommendations
 * for specialized knowledge areas (code, medical, legal, scientific, financial).
 *
 * Includes DB-aware helpers for stats, provider checks, batch-detect, and config storage.
 */

import { db, schema } from '@/server/db';
import { sql, eq } from 'drizzle-orm';

// ─── Types ──────────────────────────────────────────────────────

export interface EmbeddingModel {
  name: string;
  provider: 'ollama' | 'openai' | 'huggingface' | 'cohere';
  model: string;
  dimensions: number;
  description: string;
  strengths: string[];
}

export interface DomainProfile {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  keywords: string[];
  recommendedModels: EmbeddingModel[];
}

export interface DomainDetectionResult {
  domain: string;
  score: number;
  matches: string[];
}

// ─── Domain Profiles ────────────────────────────────────────────

export const DOMAIN_PROFILES: DomainProfile[] = [
  {
    id: 'general',
    name: 'General',
    description: 'Default embedding model for general-purpose content.',
    icon: 'Box',
    color: 'teal',
    keywords: [],
    recommendedModels: [
      {
        name: 'OpenAI text-embedding-3-small',
        provider: 'openai',
        model: 'text-embedding-3-small',
        dimensions: 1536,
        description: 'Fast, cost-effective, high-quality general embeddings.',
        strengths: ['Fast', 'Low cost', 'Good accuracy', 'Wide language support'],
      },
      {
        name: 'Gemini text-embedding-004',
        provider: 'openai',
        model: 'text-embedding-004',
        dimensions: 768,
        description: "Google's latest embedding model. Free tier available.",
        strengths: ['Free tier', 'Good accuracy', 'Multilingual'],
      },
      {
        name: 'Nomic Embed Text (Ollama)',
        provider: 'ollama',
        model: 'nomic-embed-text',
        dimensions: 768,
        description: 'High-quality local embeddings. No API key needed.',
        strengths: ['Fully local', 'Privacy-first', 'No cost', 'Good quality'],
      },
    ],
  },
  {
    id: 'code',
    name: 'Code & Programming',
    description: 'Optimized for source code, documentation, APIs, and technical content.',
    icon: 'Code',
    color: 'sky',
    keywords: [
      'function', 'class', 'import', 'const', 'let', 'var', 'def', 'return',
      'async', 'await', 'interface', 'type', 'enum', 'struct', 'impl',
      'module', 'package', 'require', 'export', 'API', 'endpoint', 'REST',
      'GraphQL', 'SQL', 'query', 'database', 'algorithm', 'git', 'docker',
      'kubernetes', 'npm', 'pip',
    ],
    recommendedModels: [
      {
        name: 'Nomic Embed Code (Ollama)',
        provider: 'ollama',
        model: 'nomic-embed-text',
        dimensions: 768,
        description: 'Good for code when fine-tuned. Best local option.',
        strengths: ['Code-aware', 'Local', 'No cost'],
      },
      {
        name: 'OpenAI text-embedding-3-large',
        provider: 'openai',
        model: 'text-embedding-3-large',
        dimensions: 3072,
        description: 'Highest accuracy OpenAI model for nuanced code similarities.',
        strengths: ['Highest accuracy', 'Code-aware', 'Large dimensions'],
      },
    ],
  },
  {
    id: 'medical',
    name: 'Medical & Health',
    description: 'Specialized for medical literature, clinical notes, and health research.',
    icon: 'Heart',
    color: 'rose',
    keywords: [
      'patient', 'diagnosis', 'treatment', 'clinical', 'trial', 'drug',
      'symptom', 'disease', 'syndrome', 'therapy', 'medication', 'dosage',
      'prognosis', 'pathology', 'surgery', 'FDA', 'NIH', 'PubMed', 'PMID',
      'ICD', 'biomarker', 'enzyme', 'receptor', 'antibody', 'vaccine',
      'protocol', 'cohort',
    ],
    recommendedModels: [
      {
        name: 'PubMedBERT (Ollama)',
        provider: 'ollama',
        model: 'nomic-embed-text',
        dimensions: 768,
        description: 'Best available local model for medical content.',
        strengths: ['Medical terminology', 'Local', 'PubMed trained'],
      },
      {
        name: 'OpenAI text-embedding-3-large',
        provider: 'openai',
        model: 'text-embedding-3-large',
        dimensions: 3072,
        description: 'Handles medical terminology well with high dimensionality.',
        strengths: ['High accuracy', 'Good medical understanding'],
      },
    ],
  },
  {
    id: 'legal',
    name: 'Legal & Compliance',
    description: 'Optimized for legal documents, contracts, and regulations.',
    icon: 'Scale',
    color: 'amber',
    keywords: [
      'contract', 'clause', 'agreement', 'plaintiff', 'defendant', 'court',
      'judge', 'statute', 'regulation', 'compliance', 'litigation',
      'arbitration', 'jurisdiction', 'tort', 'liability', 'indemnity',
      'precedent', 'brief', 'motion', 'verdict', 'appeal', 'amendment',
      'ordinance', 'GDPR', 'CCPA', 'HIPAA', 'SEC', 'FTC',
    ],
    recommendedModels: [
      {
        name: 'Nomic Embed Text (Ollama)',
        provider: 'ollama',
        model: 'nomic-embed-text',
        dimensions: 768,
        description: 'General-purpose model — reasonable for legal text locally.',
        strengths: ['Local', 'No cost', 'Decent accuracy'],
      },
      {
        name: 'OpenAI text-embedding-3-large',
        provider: 'openai',
        model: 'text-embedding-3-large',
        dimensions: 3072,
        description: 'Best for legal nuance and complex text.',
        strengths: ['High accuracy', 'Handles complexity'],
      },
    ],
  },
  {
    id: 'scientific',
    name: 'Scientific Research',
    description: 'For academic papers, research notes, and scholarly content.',
    icon: 'FlaskConical',
    color: 'emerald',
    keywords: [
      'hypothesis', 'experiment', 'results', 'methodology', 'abstract',
      'conclusion', 'peer-reviewed', 'citation', 'journal', 'DOI', 'arxiv',
      'thesis', 'dissertation', 'coefficient', 'p-value', 'significance',
      'correlation', 'regression', 'dataset', 'sample', 'control',
      'variable', 'quantum', 'molecular', 'genome', 'neural', 'entropy',
    ],
    recommendedModels: [
      {
        name: 'Snowflake Arctic Embed (Ollama)',
        provider: 'ollama',
        model: 'snowflake-arctic-embed',
        dimensions: 1024,
        description: 'Strong retrieval model for technical and scientific content.',
        strengths: ['Retrieval-optimized', 'Local', 'Technical content'],
      },
      {
        name: 'OpenAI text-embedding-3-large',
        provider: 'openai',
        model: 'text-embedding-3-large',
        dimensions: 3072,
        description: 'Highest quality for scientific content.',
        strengths: ['Highest accuracy', 'Wide domain knowledge'],
      },
    ],
  },
  {
    id: 'financial',
    name: 'Finance & Business',
    description: 'For financial reports, market analysis, and business strategy.',
    icon: 'TrendingUp',
    color: 'sky',
    keywords: [
      'revenue', 'profit', 'margin', 'EBITDA', 'valuation', 'portfolio',
      'equity', 'bond', 'derivative', 'hedge', 'ROI', 'P/E', 'market cap',
      'IPO', 'SEC', 'quarterly', 'fiscal', 'cash flow', 'balance sheet',
      'income statement', 'dividend', 'yield', 'volatility', 'inflation',
      'GDP', 'Fed', 'stock', 'trading',
    ],
    recommendedModels: [
      {
        name: 'OpenAI text-embedding-3-small',
        provider: 'openai',
        model: 'text-embedding-3-small',
        dimensions: 1536,
        description: 'Good balance of cost and accuracy for financial content.',
        strengths: ['Good accuracy', 'Cost-effective', 'Financial terms'],
      },
      {
        name: 'Nomic Embed Text (Ollama)',
        provider: 'ollama',
        model: 'nomic-embed-text',
        dimensions: 768,
        description: 'Local option — privacy-first for sensitive financial data.',
        strengths: ['Local', 'Privacy-first', 'No data leaves device'],
      },
    ],
  },
];

// ─── Domain Detection ───────────────────────────────────────────

/**
 * Detect domains in a text based on keyword density.
 * Returns scored results sorted by confidence (highest first).
 */
export function detectDomain(text: string): DomainDetectionResult[] {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);
  const wordSet = new Set(words);

  return DOMAIN_PROFILES.filter((d) => d.id !== 'general')
    .map((profile) => {
      const matches = profile.keywords.filter((kw) => {
        const kwLower = kw.toLowerCase();
        return wordSet.has(kwLower) || lower.includes(kwLower);
      });
      const score = matches.length / Math.max(profile.keywords.length, 1);
      return { domain: profile.id, score, matches };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Get the primary domain for a text.
 * Returns 'general' if no domain exceeds the threshold.
 */
export function primaryDomain(
  text: string,
  threshold: number = 0.05,
): DomainDetectionResult {
  const results = detectDomain(text);
  if (results.length > 0 && results[0].score > threshold) {
    return results[0];
  }
  return { domain: 'general', score: 1, matches: [] };
}

/**
 * Get a DomainProfile by ID. Returns general if not found.
 */
export function getDomainProfile(domainId: string): DomainProfile {
  return (
    DOMAIN_PROFILES.find((d) => d.id === domainId) ||
    DOMAIN_PROFILES.find((d) => d.id === 'general')!
  );
}

/**
 * Filter embedding models for a domain by available providers.
 */
export function availableModelsForDomain(
  domainId: string,
  providers: { openai: boolean; ollama: boolean; huggingface?: boolean },
): EmbeddingModel[] {
  const profile = getDomainProfile(domainId);
  return profile.recommendedModels.filter(
    (m) =>
      (m.provider === 'openai' && providers.openai) ||
      (m.provider === 'ollama' && providers.ollama) ||
      (m.provider === 'huggingface' && providers.huggingface),
  );
}

// ─── DB-Aware Helpers ──────────────────────────────────────────

const PLUGIN_SLUG = 'domain-embeddings';

/** Ensure the plugin row exists in the plugins table. */
export async function ensureInstalled(): Promise<void> {
  try {
    const existing = await db.select().from(schema.plugins).where(eq(schema.plugins.slug, PLUGIN_SLUG)).limit(1);
    if (existing.length === 0) {
      await db.insert(schema.plugins).values({
        slug: PLUGIN_SLUG,
        name: 'Domain Embeddings',
        description: 'Specialized embedding models for specific knowledge domains.',
        version: '1.0.0',
        type: 'extension',
        status: 'active',
        icon: 'Dna',
        category: 'ai',
        config: {},
      });
    }
  } catch {}
}

/** Check which AI providers are available from settings + env. */
export async function getProviderAvailability(userId?: string): Promise<{
  providers: { openai: boolean; gemini: boolean; ollama: boolean };
  currentProvider: string;
}> {
  const { DEFAULT_USER_ID } = await import('@/server/identity');
  const effectiveUserId = userId ?? DEFAULT_USER_ID;
  const settings = await db.execute(sql`
    SELECT key, value FROM settings
    WHERE user_id = ${effectiveUserId}::uuid
      AND key IN ('openai_api_key', 'gemini_api_key', 'ollama_url', 'embedding_provider')
  `);
  const config: Record<string, string> = {};
  for (const row of settings as any[]) config[row.key] = row.value;

  return {
    providers: {
      openai: !!(config.openai_api_key || process.env.OPENAI_API_KEY),
      gemini: !!(config.gemini_api_key || process.env.GEMINI_API_KEY),
      ollama: !!(config.ollama_url || process.env.OLLAMA_URL),
    },
    currentProvider: config.embedding_provider || 'auto',
  };
}

/** Get the plugin config from DB. */
export async function getPluginConfig(): Promise<Record<string, unknown>> {
  const rows = await db.execute(sql`SELECT config FROM plugins WHERE slug = ${PLUGIN_SLUG}`);
  return ((rows as any[])[0]?.config || {}) as Record<string, unknown>;
}

/** Save domain model configuration into the plugin config. */
export async function saveDomainConfig(body: {
  domainModels?: Record<string, unknown>;
  autoDetect?: boolean;
  defaultDomain?: string;
}): Promise<void> {
  const { domainModels, autoDetect = true, defaultDomain = 'general' } = body;
  await db.execute(sql`
    UPDATE plugins SET config = config || ${JSON.stringify({ domainModels: domainModels || {}, autoDetect, defaultDomain })}::jsonb
    WHERE slug = ${PLUGIN_SLUG}
  `);
}

/** Get domain distribution stats for a user's memories. */
export async function getDomainStats(userId: string): Promise<{
  domainDistribution: Array<{ domain: string; name: string; count: number; examples: string[] }>;
  totalAnalyzed: number;
  embeddingCoverage: { withEmbeddings: number; total: number };
}> {
  const allMemories = await db.execute(sql`
    SELECT id, content, metadata FROM memories
    WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 500
  `);

  const domainCounts: Record<string, number> = { general: 0 };
  const domainExamples: Record<string, string[]> = {};

  for (const mem of allMemories as any[]) {
    const content = mem.content || '';
    const existingDomain = mem.metadata?.domain;

    if (existingDomain) {
      domainCounts[existingDomain] = (domainCounts[existingDomain] || 0) + 1;
    } else {
      const detected = detectDomain(content);
      if (detected.length > 0 && detected[0].score > 0.05) {
        const domain = detected[0].domain;
        domainCounts[domain] = (domainCounts[domain] || 0) + 1;
        if (!domainExamples[domain]) domainExamples[domain] = [];
        if (domainExamples[domain].length < 3) domainExamples[domain].push(content.slice(0, 100));
      } else {
        domainCounts.general++;
      }
    }
  }

  const embStats = await db.execute(sql`
    SELECT COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embeddings, COUNT(*) as total
    FROM memories WHERE user_id = ${userId}
  `);
  const eRow = (embStats as any[])[0] || {};

  return {
    domainDistribution: Object.entries(domainCounts)
      .map(([domain, count]) => ({
        domain,
        name: DOMAIN_PROFILES.find(d => d.id === domain)?.name || domain,
        count,
        examples: domainExamples[domain] || [],
      }))
      .sort((a, b) => b.count - a.count),
    totalAnalyzed: (allMemories as any[]).length,
    embeddingCoverage: {
      withEmbeddings: parseInt(eRow.with_embeddings || '0'),
      total: parseInt(eRow.total || '0'),
    },
  };
}

/** Tag a single memory with a domain. */
export async function tagMemoryDomain(userId: string, memoryId: string, domain: string): Promise<void> {
  if (!DOMAIN_PROFILES.find(d => d.id === domain) && domain !== 'general') {
    throw new Error('Invalid domain');
  }
  await db.execute(sql`
    UPDATE memories SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ domain })}::jsonb
    WHERE id = ${memoryId} AND user_id = ${userId}
  `);
}

/** Batch auto-detect domains for untagged memories. */
export async function batchDetectDomains(userId: string, batchSize: number = 100): Promise<{
  tagged: number;
  remaining: number;
  domainCounts: Record<string, number>;
}> {
  const untagged = await db.execute(sql`
    SELECT id, content, metadata FROM memories
    WHERE user_id = ${userId}
    AND (metadata->>'domain' IS NULL OR metadata->>'domain' = '')
    ORDER BY created_at DESC LIMIT ${batchSize}
  `);

  let tagged = 0;
  const domainCounts: Record<string, number> = {};

  for (const mem of untagged as any[]) {
    const detected = detectDomain(mem.content || '');
    const domain = detected.length > 0 && detected[0].score > 0.05 ? detected[0].domain : 'general';
    const newMeta = { ...(mem.metadata || {}), domain };
    await db.execute(sql`
      UPDATE memories SET metadata = ${JSON.stringify(newMeta)}::jsonb
      WHERE id = ${mem.id} AND user_id = ${userId}
    `);
    tagged++;
    domainCounts[domain] = (domainCounts[domain] || 0) + 1;
  }

  const remaining = await db.execute(sql`
    SELECT COUNT(*) as count FROM memories
    WHERE user_id = ${userId}
    AND (metadata->>'domain' IS NULL OR metadata->>'domain' = '')
  `);

  return {
    tagged,
    remaining: parseInt((remaining as any[])[0]?.count || '0'),
    domainCounts,
  };
}
