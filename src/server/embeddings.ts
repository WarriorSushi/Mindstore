/**
 * Embedding provider abstraction.
 * Supports: OpenAI, Gemini (free), Ollama (local)
 * 
 * Priority: uses whichever provider has a key configured.
 * Gemini is free tier — great default for users without OpenAI keys.
 */

import { db } from './db';
import { sql } from 'drizzle-orm';
import { decrypt } from './encryption';

export type EmbeddingProvider = 'openai' | 'gemini' | 'ollama';

interface EmbeddingConfig {
  provider: EmbeddingProvider;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

// Get the best available embedding provider
export async function getEmbeddingConfig(): Promise<EmbeddingConfig | null> {
  // Check settings table for configured providers
  const settings = await db.execute(sql`SELECT key, value FROM settings WHERE key IN ('openai_api_key', 'gemini_api_key', 'ollama_url', 'embedding_provider')`);
  
  const config: Record<string, string> = {};
  for (const row of settings as any[]) {
    // Decrypt API keys that may be encrypted at rest
    config[row.key] = row.key.includes('api_key') ? decrypt(row.value) : row.value;
  }

  // Explicit provider choice
  const preferred = config.embedding_provider;
  
  if (preferred === 'ollama' || (!preferred && config.ollama_url)) {
    return {
      provider: 'ollama',
      baseUrl: config.ollama_url || 'http://localhost:11434',
      model: 'nomic-embed-text',
    };
  }
  
  if (preferred === 'gemini' || (!preferred && config.gemini_api_key)) {
    return {
      provider: 'gemini',
      apiKey: config.gemini_api_key,
      model: 'text-embedding-004',
    };
  }
  
  if (preferred === 'openai' || (!preferred && config.openai_api_key)) {
    return {
      provider: 'openai',
      apiKey: config.openai_api_key,
      model: 'text-embedding-3-small',
    };
  }

  // Check env vars as fallback
  if (process.env.GEMINI_API_KEY) {
    return { provider: 'gemini', apiKey: process.env.GEMINI_API_KEY, model: 'text-embedding-004' };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: 'openai', apiKey: process.env.OPENAI_API_KEY, model: 'text-embedding-3-small' };
  }
  if (process.env.OLLAMA_URL) {
    return { provider: 'ollama', baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434', model: 'nomic-embed-text' };
  }

  return null;
}

/**
 * Generate embeddings using the configured provider.
 *
 * `mode` controls Gemini's `taskType` — "document" (default) tags the input
 * as `RETRIEVAL_DOCUMENT` for ingestion-side embedding, "query" tags it as
 * `RETRIEVAL_QUERY` for search-side. Tagging the wrong side measurably
 * degrades Gemini retrieval quality.
 *
 * OpenAI and Ollama don't expose a task-type knob, so the parameter is a
 * no-op for those providers.
 */
export type EmbeddingMode = 'document' | 'query';

export async function generateEmbeddings(
  texts: string[],
  options?: { mode?: EmbeddingMode },
): Promise<number[][] | null> {
  const config = await getEmbeddingConfig();
  if (!config) return null;

  const mode: EmbeddingMode = options?.mode ?? 'document';

  switch (config.provider) {
    case 'openai':
      return generateOpenAIEmbeddings(texts, config.apiKey!, config.model!);
    case 'gemini':
      return generateGeminiEmbeddings(texts, config.apiKey!, config.model!, mode);
    case 'ollama':
      return generateOllamaEmbeddings(texts, config.baseUrl!, config.model!);
    default:
      return null;
  }
}

// OpenAI embeddings
async function generateOpenAIEmbeddings(texts: string[], apiKey: string, model: string): Promise<number[][]> {
  const batchSize = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, input: batch }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(`OpenAI embedding error: ${err.error?.message || res.statusText}`);
    }

    const data = await res.json();
    const embeddings = data.data
      .sort((a: any, b: any) => a.index - b.index)
      .map((d: any) => d.embedding);
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}

// Gemini embeddings (free tier: 1500 RPD)
async function generateGeminiEmbeddings(
  texts: string[],
  apiKey: string,
  model: string,
  mode: EmbeddingMode,
): Promise<number[][]> {
  const allEmbeddings: number[][] = [];
  const taskType = mode === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT';

  // Gemini batch embed endpoint
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);

    const requests = batch.map(text => ({
      model: `models/${model}`,
      content: { parts: [{ text }] },
      taskType,
    }));

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
      }
    );

    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Gemini embedding error: ${err.error?.message || res.statusText}`);
    }

    const data = await res.json();
    const embeddings = data.embeddings.map((e: any) => e.values);
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}

// Ollama embeddings (local, free)
async function generateOllamaEmbeddings(texts: string[], baseUrl: string, model: string): Promise<number[][]> {
  const allEmbeddings: number[][] = [];

  for (const text of texts) {
    const res = await fetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
    });

    if (!res.ok) throw new Error(`Ollama embedding error: ${res.statusText}`);

    const data = await res.json();
    allEmbeddings.push(data.embedding);
  }

  return allEmbeddings;
}

// Get the dimension of embeddings for the current provider
export function getEmbeddingDimension(provider: EmbeddingProvider): number {
  switch (provider) {
    case 'openai': return 1536;
    case 'gemini': return 768;
    case 'ollama': return 768; // nomic-embed-text default
    default: return 1536;
  }
}
