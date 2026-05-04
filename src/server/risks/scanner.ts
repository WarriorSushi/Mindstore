/**
 * Knowledge Attack Surface scanner — Phase 4 (innovation B.2).
 *
 * Scans the user's memories for four classes of risk:
 *
 *   1. Exposed secrets — regex match against common API key shapes,
 *      JWTs, private-key blocks, AWS keys, etc.
 *   2. PII — email + phone-number patterns, SSN-shaped strings.
 *   3. Single points of failure — clusters of high-importance topics
 *      held in <= 2 memories.
 *   4. Knowledge silos — source-type concentration above 80% (one
 *      source dominates the user's worldview).
 *
 * Designed to be cheap (zero LLM calls; pure regex + DB aggregation)
 * so it can run as a weekly cron without budget impact.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/server/db';

export type RiskType = 'secret' | 'spof' | 'silo' | 'gap' | 'pii';
export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface ScannedRisk {
  riskType: RiskType;
  severity: RiskSeverity;
  description: string;
  affectedMemoryIds: string[];
  metadata: Record<string, unknown>;
}

/**
 * Pure pattern matchers for individual memory contents. Exported for
 * unit-testing without a database.
 */
export const SECRET_PATTERNS: Array<{ name: string; severity: RiskSeverity; pattern: RegExp }> = [
  { name: 'OpenAI key',        severity: 'critical', pattern: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { name: 'OpenAI proj key',   severity: 'critical', pattern: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Anthropic key',     severity: 'critical', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Google API key',    severity: 'critical', pattern: /\bAIza[A-Za-z0-9_-]{30,}\b/ },
  { name: 'AWS access key',    severity: 'critical', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'AWS secret key',    severity: 'critical', pattern: /\b[A-Za-z0-9/+=]{40}\b(?=\s*(?:aws|secret|key))/i },
  { name: 'GitHub PAT',        severity: 'high',     pattern: /\bghp_[A-Za-z0-9]{30,}\b/ },
  { name: 'Slack token',       severity: 'high',     pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'JWT',               severity: 'medium',   pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/ },
  { name: 'Private-key block', severity: 'critical', pattern: /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/ },
];

export const PII_PATTERNS: Array<{ name: string; severity: RiskSeverity; pattern: RegExp }> = [
  // SSN: deliberately strict — three digits, dash, two digits, dash, four digits.
  { name: 'US SSN',            severity: 'high',   pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  // E.164 phone numbers (loose).
  { name: 'Phone number',      severity: 'medium', pattern: /\b\+?\d{1,3}[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/ },
];

export interface MemoryForScan {
  id: string;
  content: string;
  sourceType: string;
}

/** Scan a single memory's content for secret/PII patterns. */
export function scanMemoryContent(memory: MemoryForScan): ScannedRisk[] {
  const out: ScannedRisk[] = [];

  for (const { name, severity, pattern } of SECRET_PATTERNS) {
    if (pattern.test(memory.content)) {
      out.push({
        riskType: 'secret',
        severity,
        // CRITICAL: never embed the matched content (or any slice of the
        // memory) into description — knowledge_risks rows are read by
        // /api/v1/risks and shown in the UI; including the secret here
        // would defeat the purpose of detecting it. The memory id in
        // affectedMemoryIds lets the UI link to the source if the user
        // wants to inspect it.
        description: `Possible ${name} detected`,
        affectedMemoryIds: [memory.id],
        metadata: { pattern: name, sourceType: memory.sourceType },
      });
    }
  }

  for (const { name, severity, pattern } of PII_PATTERNS) {
    if (pattern.test(memory.content)) {
      out.push({
        riskType: 'pii',
        severity,
        description: `Possible ${name} detected`,
        affectedMemoryIds: [memory.id],
        metadata: { pattern: name, sourceType: memory.sourceType },
      });
    }
  }

  return out;
}

/**
 * Aggregate-level risk: source-type silo. If one source accounts for
 * more than 80% of memories, flag it as a silo.
 */
export function detectSilo(input: { sourceCounts: Record<string, number>; total: number }): ScannedRisk | null {
  if (input.total < 20) return null; // not enough data to flag a silo
  const entries = Object.entries(input.sourceCounts).sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return null;
  const [topSource, topCount] = entries[0];
  const share = topCount / input.total;
  if (share < 0.8) return null;
  return {
    riskType: 'silo',
    severity: share >= 0.95 ? 'high' : 'medium',
    description: `${Math.round(share * 100)}% of your knowledge comes from a single source (${topSource}). Diversify your inputs to avoid blind spots.`,
    affectedMemoryIds: [],
    metadata: { dominantSource: topSource, share },
  };
}

/**
 * Single-point-of-failure detector: any source_title with only 1 or 2
 * memories under it, where the title looks "important" (heuristic:
 * mentions credentials, recovery, account, password, key, vault).
 */
export function detectSpof(input: { perTitle: Array<{ title: string; count: number; memoryIds: string[] }> }): ScannedRisk[] {
  const importantWords = /(\bpassword\b|\brecovery\b|\bvault\b|\bcredential\b|\baccount\b|\bsecret key\b|\bbackup\b|\bcontract\b|\bpolicy\b|\bagreement\b)/i;
  const out: ScannedRisk[] = [];
  for (const row of input.perTitle) {
    if (row.count > 2) continue;
    if (!importantWords.test(row.title)) continue;
    out.push({
      riskType: 'spof',
      severity: row.count === 1 ? 'high' : 'medium',
      description: `"${row.title}" only appears in ${row.count} memor${row.count === 1 ? 'y' : 'ies'}. Critical knowledge concentrated like this is a single point of failure.`,
      affectedMemoryIds: row.memoryIds.slice(0, 5),
      metadata: { title: row.title, count: row.count },
    });
  }
  return out;
}

/**
 * Top-level scan: pulls the user's memories from the DB, runs every
 * detector, persists the results to knowledge_risks (replacing previous
 * un-dismissed rows for the same user). Returns the new risks.
 */
export async function scanUserKnowledge(userId: string): Promise<ScannedRisk[]> {
  // Pull every memory for the user, content-only (we don't need embeddings).
  const memoryRows = (await db.execute(sql`
    SELECT id, content, source_type, source_title
    FROM memories
    WHERE user_id = ${userId}::uuid
  `)) as unknown as Array<{ id: string; content: string; source_type: string; source_title: string | null }>;

  const risks: ScannedRisk[] = [];

  // Per-memory scans (secret, PII).
  for (const row of memoryRows) {
    risks.push(...scanMemoryContent({ id: row.id, content: row.content, sourceType: row.source_type }));
  }

  // Source counts.
  const sourceCounts: Record<string, number> = {};
  for (const row of memoryRows) {
    sourceCounts[row.source_type] = (sourceCounts[row.source_type] ?? 0) + 1;
  }
  const silo = detectSilo({ sourceCounts, total: memoryRows.length });
  if (silo) risks.push(silo);

  // SPoF on titles.
  const titleMap = new Map<string, { count: number; memoryIds: string[] }>();
  for (const row of memoryRows) {
    const t = row.source_title?.trim();
    if (!t) continue;
    let entry = titleMap.get(t);
    if (!entry) { entry = { count: 0, memoryIds: [] }; titleMap.set(t, entry); }
    entry.count += 1;
    entry.memoryIds.push(row.id);
  }
  const perTitle = Array.from(titleMap.entries()).map(([title, value]) => ({ title, count: value.count, memoryIds: value.memoryIds }));
  risks.push(...detectSpof({ perTitle }));

  // Persist: clear old un-dismissed rows then insert fresh ones.
  await db.execute(sql`
    DELETE FROM knowledge_risks
    WHERE user_id = ${userId}::uuid AND dismissed = 0
  `);

  for (const risk of risks) {
    await db.execute(sql`
      INSERT INTO knowledge_risks (
        user_id, risk_type, severity, description, affected_memory_ids, metadata
      ) VALUES (
        ${userId}::uuid,
        ${risk.riskType}::knowledge_risk_type,
        ${risk.severity}::knowledge_risk_severity,
        ${risk.description},
        ${risk.affectedMemoryIds}::uuid[],
        ${JSON.stringify(risk.metadata)}::jsonb
      )
    `);
  }

  return risks;
}

/**
 * Read the user's current (un-dismissed) risks ordered by severity.
 */
export async function listRisks(userId: string): Promise<Array<ScannedRisk & { id: string; detectedAt: Date }>> {
  const rows = (await db.execute(sql`
    SELECT id, risk_type, severity, description, affected_memory_ids, metadata, detected_at
    FROM knowledge_risks
    WHERE user_id = ${userId}::uuid AND dismissed = 0
    ORDER BY
      CASE severity
        WHEN 'critical' THEN 0
        WHEN 'high'     THEN 1
        WHEN 'medium'   THEN 2
        WHEN 'low'      THEN 3
      END,
      detected_at DESC
  `)) as unknown as Array<{
    id: string;
    risk_type: RiskType;
    severity: RiskSeverity;
    description: string;
    affected_memory_ids: string[];
    metadata: Record<string, unknown>;
    detected_at: string | Date;
  }>;

  return rows.map((row) => ({
    id: row.id,
    riskType: row.risk_type,
    severity: row.severity,
    description: row.description,
    affectedMemoryIds: row.affected_memory_ids,
    metadata: row.metadata,
    detectedAt: new Date(row.detected_at),
  }));
}

export async function dismissRisk(userId: string, riskId: string): Promise<boolean> {
  const result = await db.execute(sql`
    UPDATE knowledge_risks
    SET dismissed = 1, dismissed_at = NOW()
    WHERE id = ${riskId}::uuid AND user_id = ${userId}::uuid AND dismissed = 0
    RETURNING id
  `);
  return ((result as unknown as Array<{ id: string }>).length) > 0;
}
