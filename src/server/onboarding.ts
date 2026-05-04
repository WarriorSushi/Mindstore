import { db } from './db';
import { sql } from 'drizzle-orm';

export interface OnboardingState {
  /** User has configured at least one AI provider */
  hasAiProvider: boolean;
  /** User has imported at least some data */
  hasMemories: boolean;
  /** User has at least some embeddings (search works) */
  hasEmbeddings: boolean;
  /** User has used the chat feature */
  hasChatted: boolean;
  /** User has explored/searched their data */
  hasSearched: boolean;
  /** Number of memories */
  memoryCount: number;
  /** Number of memories with embeddings */
  embeddedCount: number;
  /** Onboarding completion percentage (0-100) */
  completionPercent: number;
  /** Suggested next step */
  nextStep: OnboardingStep;
}

export type OnboardingStep = 
  | 'connect-ai'
  | 'import-data'
  | 'embed-data'
  | 'explore'
  | 'chat'
  | 'complete';

/**
 * Get the user's onboarding state — what they've done, what's next.
 * Light query, safe to call on every dashboard load.
 */
export async function getOnboardingState(userId: string): Promise<OnboardingState> {
  const [memoriesRes, settingsRes] = await Promise.allSettled([
    db.execute(sql`
      SELECT 
        COUNT(*)::int as total,
        COUNT(embedding)::int as embedded
      FROM memories WHERE user_id = ${userId}::uuid
    `),
    db.execute(sql`
      SELECT key FROM settings
      WHERE user_id = ${userId}::uuid
        AND key IN (
          'openai_api_key', 'gemini_api_key', 'ollama_url', 'openrouter_api_key', 'custom_api_key'
        )
      LIMIT 1
    `),
  ]);

  const memRow = memoriesRes.status === 'fulfilled' ? (memoriesRes.value as any[])[0] : { total: 0, embedded: 0 };
  const memoryCount = memRow?.total || 0;
  const embeddedCount = memRow?.embedded || 0;
  const hasSettings = settingsRes.status === 'fulfilled' && (settingsRes.value as any[]).length > 0;
  
  const hasAiProvider = hasSettings || !!process.env.GEMINI_API_KEY || !!process.env.OPENAI_API_KEY || !!process.env.OLLAMA_URL;
  const hasMemories = memoryCount > 0;
  const hasEmbeddings = embeddedCount > 0;

  // For hasChatted and hasSearched, we can infer from the data
  // (chat creates memories with sourceType 'text' from save-to-memory, search leaves no trace)
  // For simplicity, mark these as true if they have enough data
  const hasChatted = hasMemories && hasAiProvider;
  const hasSearched = hasEmbeddings;

  // Determine next step
  let nextStep: OnboardingStep;
  if (!hasAiProvider) nextStep = 'connect-ai';
  else if (!hasMemories) nextStep = 'import-data';
  else if (!hasEmbeddings) nextStep = 'embed-data';
  else if (!hasSearched) nextStep = 'explore';
  else if (!hasChatted) nextStep = 'chat';
  else nextStep = 'complete';

  // Completion
  const steps = [hasAiProvider, hasMemories, hasEmbeddings, hasSearched, hasChatted];
  const completionPercent = Math.round((steps.filter(Boolean).length / steps.length) * 100);

  return {
    hasAiProvider,
    hasMemories,
    hasEmbeddings,
    hasChatted,
    hasSearched,
    memoryCount,
    embeddedCount,
    completionPercent,
    nextStep,
  };
}
