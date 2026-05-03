import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { PLUGIN_MANIFESTS } from "@/server/plugins/registry";

const PLUGIN_SLUG = "writing-style";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of",
  "with", "by", "from", "as", "is", "was", "are", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
  "may", "might", "can", "shall", "it", "its", "this", "that", "these", "those",
  "i", "me", "my", "we", "our", "you", "your", "he", "she", "they", "them",
  "his", "her", "their", "what", "which", "who", "when", "where", "how", "why",
  "not", "no", "so", "if", "then", "than", "just", "about", "also", "into",
  "all", "more", "some", "any", "each", "there", "here", "up", "out", "like",
  "very", "most", "only", "over", "such", "after", "before", "between", "through",
  "during", "while", "because", "since", "until", "both", "other", "same",
  "well", "still", "even", "new", "first", "last", "many", "much", "own",
  "way", "now", "get", "make", "made", "one", "two", "know", "think",
  "see", "come", "say", "said", "go", "going", "take", "thing", "things",
  "time", "want", "use", "used", "using", "need", "work", "part", "really",
]);

const FORMAL_WORDS = new Set([
  "therefore", "furthermore", "consequently", "nevertheless", "accordingly",
  "notwithstanding", "henceforth", "moreover", "albeit", "whereby", "herein",
  "regarding", "pertaining", "facilitate", "subsequent", "preliminary",
  "comprehensive", "demonstrate", "implement", "methodology", "framework",
  "paradigm", "respective", "constitute", "substantial", "sufficient",
]);

const CASUAL_WORDS = new Set([
  "yeah", "yep", "nope", "gonna", "wanna", "kinda", "sorta", "gotta",
  "hey", "cool", "awesome", "stuff", "thing", "basically", "literally",
  "lol", "btw", "tbh", "imo", "imho", "omg", "haha", "ok", "okay",
  "pretty", "super", "totally", "actually", "just", "really", "crazy",
  "dude", "folks", "guys", "def", "legit", "nah", "yea",
]);

const TECHNICAL_WORDS = new Set([
  "algorithm", "api", "async", "backend", "binary", "boolean", "buffer",
  "cache", "callback", "class", "compiler", "component", "config", "cpu",
  "database", "debug", "deploy", "docker", "endpoint", "function", "git",
  "graphql", "http", "index", "instance", "interface", "iteration", "json",
  "kernel", "lambda", "library", "linux", "loop", "memory", "module",
  "mutex", "node", "object", "parameter", "parser", "pipeline", "plugin",
  "pointer", "protocol", "query", "queue", "react", "recursive", "regex",
  "render", "repository", "rest", "runtime", "schema", "server", "socket",
  "sql", "stack", "state", "string", "syntax", "thread", "token", "type",
  "typescript", "variable", "vector", "webhook", "yaml",
]);

const HEDGING_PATTERNS = [
  /\b(maybe|perhaps|possibly|might|could be|seems like|sort of|kind of)\b/gi,
  /\b(i think|i guess|i suppose|i believe|i feel like)\b/gi,
  /\b(probably|likely|apparently|roughly|approximately|somewhat)\b/gi,
  /\b(tend to|in my opinion|as far as i know|it appears|it seems)\b/gi,
];

const CONFIDENCE_PATTERNS = [
  /\b(definitely|certainly|absolutely|clearly|obviously|undoubtedly)\b/gi,
  /\b(i know|i'm sure|i'm certain|without doubt|no question)\b/gi,
  /\b(always|never|must|exactly|precisely|guaranteed)\b/gi,
  /\b(the fact is|it's clear that|there's no doubt|conclusively)\b/gi,
];

interface WritingStyleDbRow {
  id: unknown;
  content: unknown;
  source_type: unknown;
  source_title: unknown;
  created_at: unknown;
  grade?: unknown;
  ease?: unknown;
  avg_sent_len?: unknown;
  avg_word_len?: unknown;
  vocab_richness?: unknown;
  tone?: unknown;
  word_count?: unknown;
  sentence_count?: unknown;
  question_rate?: unknown;
  exclamation_rate?: unknown;
  hedging_rate?: unknown;
  confidence_rate?: unknown;
}

interface MonthlyEvolutionAccumulator {
  grades: number[];
  eases: number[];
  sentLens: number[];
  wordLens: number[];
  vocabs: number[];
  count: number;
  tones: Record<string, number>;
  questionRates: number[];
  confidenceRates: number[];
}

export interface WritingStyleMemoryResult {
  id: string;
  content: string;
  sourceType: string;
  sourceTitle: string;
  createdAt: string | null;
  grade: number;
  ease: number;
  avgSentenceLength: number;
  avgWordLength: number;
  vocabRichness: number;
  tone: string;
  wordCount: number;
  sentenceCount: number;
  questionRate: number;
  exclamationRate: number;
  hedgingRate: number;
  confidenceRate: number;
}

export interface WritingStyleProfile {
  avgGradeLevel: number;
  medianGradeLevel: number;
  readabilityLevel: string;
  avgReadingEase: number;
  easeLabel: string;
  totalWords: number;
  uniqueWordCount: number;
  typeTokenRatio: number;
  avgVocabRichness: number;
  rareWordCount: number;
  topWords: Array<{ word: string; count: number; pct: number }>;
  topBigrams: Array<{ phrase: string; count: number }>;
  topTrigrams: Array<{ phrase: string; count: number }>;
  avgSentenceLength: number;
  medianSentenceLength: number;
  totalSentences: number;
  sentenceLengthDistribution: Record<string, number>;
  avgWordLength: number;
  toneDistribution: Record<string, number>;
  dominantTone: string;
  avgQuestionRate: number;
  avgExclamationRate: number;
  avgHedgingRate: number;
  avgConfidenceRate: number;
  complexityScore: number;
  styleBySource: Array<{
    source: string;
    count: number;
    avgGrade: number;
    avgEase: number;
    avgSentenceLength: number;
    dominantTone: string;
  }>;
  evolution: Array<{
    month: string;
    count: number;
    avgGrade: number;
    avgEase: number;
    avgSentenceLength: number;
    avgWordLength: number;
    vocabRichness: number;
    questionRate: number;
    confidenceRate: number;
    dominantTone: string;
  }>;
}

export interface WritingStyleResultsResponse {
  memories: WritingStyleMemoryResult[];
  totalAnalyzed: number;
  totalEligible: number;
}

export interface WritingStyleProfileResponse {
  analyzed: number;
  totalEligible: number;
  profile: WritingStyleProfile | null;
}

export interface TextMetrics {
  gradeLevel: number;
  readingEase: number;
  avgSentenceLength: number;
  avgWordLength: number;
  typeTokenRatio: number;
  tone: string;
  wordCount: number;
  sentenceCount: number;
  questionRate: number;
  exclamationRate: number;
  hedgingRate: number;
  confidenceRate: number;
}

export async function ensureWritingStyleInstalled() {
  const manifest = PLUGIN_MANIFESTS[PLUGIN_SLUG];
  const [existing] = await db
    .select()
    .from(schema.plugins)
    .where(eq(schema.plugins.slug, PLUGIN_SLUG))
    .limit(1);

  if (existing || !manifest) {
    return;
  }

  await db.insert(schema.plugins).values({
    slug: manifest.slug,
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    type: manifest.type,
    status: "active",
    icon: manifest.icon,
    category: manifest.category,
    author: manifest.author,
    metadata: {
      capabilities: manifest.capabilities,
      hooks: manifest.hooks,
      routes: manifest.routes,
      aliases: manifest.aliases || [],
      dashboardWidgets: manifest.ui?.dashboardWidgets || [],
      pages: manifest.ui?.pages || [],
    },
  });
}

export async function runWritingStyleAnalysis(userId: string) {
  const rows = await db.execute(sql`
    SELECT id, content, source_type, source_title, created_at
    FROM memories
    WHERE user_id = ${userId}::uuid
      AND (metadata->>'writing_style_grade' IS NULL)
      AND LENGTH(content) > 50
    ORDER BY created_at DESC
    LIMIT 500
  `) as unknown as WritingStyleDbRow[];

  if (rows.length === 0) {
    return {
      analyzed: 0,
      message: "All memories have been analyzed already.",
    };
  }

  let analyzed = 0;

  for (const row of rows) {
    const metrics = analyzeText(String(row.content || ""));

    await db.execute(sql`
      UPDATE memories
      SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'writing_style_grade', ${metrics.gradeLevel.toString()},
        'writing_style_ease', ${metrics.readingEase.toString()},
        'writing_style_avgSentLen', ${metrics.avgSentenceLength.toString()},
        'writing_style_avgWordLen', ${metrics.avgWordLength.toString()},
        'writing_style_vocabRichness', ${metrics.typeTokenRatio.toString()},
        'writing_style_tone', ${metrics.tone},
        'writing_style_wordCount', ${metrics.wordCount.toString()},
        'writing_style_sentenceCount', ${metrics.sentenceCount.toString()},
        'writing_style_questionRate', ${metrics.questionRate.toString()},
        'writing_style_exclamationRate', ${metrics.exclamationRate.toString()},
        'writing_style_hedgingRate', ${metrics.hedgingRate.toString()},
        'writing_style_confidenceRate', ${metrics.confidenceRate.toString()}
      )
      WHERE id = ${String(row.id)}::uuid AND user_id = ${userId}::uuid
    `);
    analyzed += 1;
  }

  const totalAnalyzed = await getAnalyzedMemoryCount(userId);

  return {
    analyzed,
    totalAnalyzed,
    message: `Analyzed ${analyzed} memories for writing style.`,
  };
}

export async function getWritingStyleResults(userId: string): Promise<WritingStyleResultsResponse> {
  const rows = await loadAnalyzedRows(userId);
  const totalEligible = await getEligibleMemoryCount(userId);

  return {
    memories: rows.map(normalizeWritingStyleRow),
    totalAnalyzed: rows.length,
    totalEligible,
  };
}

export async function getWritingStyleProfile(userId: string): Promise<WritingStyleProfileResponse> {
  const rows = await loadAnalyzedRows(userId);
  const totalEligible = await getEligibleMemoryCount(userId);

  if (rows.length === 0) {
    return {
      analyzed: 0,
      totalEligible,
      profile: null,
    };
  }

  const grades = rows.map((row) => toNumber(row.grade));
  const easeScores = rows.map((row) => toNumber(row.ease));
  const sentenceLengths = rows.map((row) => toNumber(row.avg_sent_len));
  const wordLengths = rows.map((row) => toNumber(row.avg_word_len));
  const vocabScores = rows.map((row) => toNumber(row.vocab_richness));
  const sentenceCounts = rows.map((row) => toInt(row.sentence_count));
  const questionRates = rows.map((row) => toNumber(row.question_rate));
  const exclamationRates = rows.map((row) => toNumber(row.exclamation_rate));
  const hedgingRates = rows.map((row) => toNumber(row.hedging_rate));
  const confidenceRates = rows.map((row) => toNumber(row.confidence_rate));

  const toneDistribution: Record<string, number> = {};
  const allWords: string[] = [];
  const bigramMap: Record<string, number> = {};
  const trigramMap: Record<string, number> = {};

  for (const row of rows) {
    const tone = toStringValue(row.tone) || "neutral";
    toneDistribution[tone] = (toneDistribution[tone] || 0) + 1;

    const words = extractWords(String(row.content || ""));
    allWords.push(...words);

    for (let index = 0; index < words.length - 1; index += 1) {
      const bigram = `${words[index]} ${words[index + 1]}`;
      bigramMap[bigram] = (bigramMap[bigram] || 0) + 1;
    }

    for (let index = 0; index < words.length - 2; index += 1) {
      const trigram = `${words[index]} ${words[index + 1]} ${words[index + 2]}`;
      trigramMap[trigram] = (trigramMap[trigram] || 0) + 1;
    }
  }

  const totalWords = allWords.length;
  const uniqueWords = new Set(allWords.map((word) => word.toLowerCase()));
  const wordFreq: Record<string, number> = {};
  for (const word of allWords) {
    const lower = word.toLowerCase();
    wordFreq[lower] = (wordFreq[lower] || 0) + 1;
  }

  const topWords = Object.entries(wordFreq)
    .filter(([word]) => !STOPWORDS.has(word) && word.length > 2)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 30)
    .map(([word, count]) => ({
      word,
      count,
      pct: round((count / Math.max(1, totalWords)) * 100, 2),
    }));

  const topBigrams = Object.entries(bigramMap)
    .filter(([phrase]) => phrase.split(" ").some((part) => !STOPWORDS.has(part) && part.length > 2))
    .sort((left, right) => right[1] - left[1])
    .slice(0, 15)
    .map(([phrase, count]) => ({ phrase, count }));

  const topTrigrams = Object.entries(trigramMap)
    .filter(([phrase]) => phrase.split(" ").filter((part) => !STOPWORDS.has(part) && part.length > 2).length >= 2)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([phrase, count]) => ({ phrase, count }));

  const rareWords = Object.entries(wordFreq)
    .filter(([word, count]) => count <= 2 && word.length >= 6 && !STOPWORDS.has(word))
    .map(([word]) => word);

  const avgGrade = average(grades);
  const avgEase = average(easeScores);
  const readabilityLevel = avgGrade <= 6
    ? "Elementary"
    : avgGrade <= 8
      ? "Middle School"
      : avgGrade <= 10
        ? "High School"
        : avgGrade <= 12
          ? "College"
          : avgGrade <= 14
            ? "College Graduate"
            : "Graduate/Professional";
  const easeLabel = avgEase >= 80
    ? "Very Easy"
    : avgEase >= 60
      ? "Standard"
      : avgEase >= 40
        ? "Fairly Difficult"
        : avgEase >= 20
          ? "Difficult"
          : "Very Difficult";

  const bySource: Record<string, {
    count: number;
    avgGrade: number;
    avgEase: number;
    avgSentLen: number;
    tones: Record<string, number>;
  }> = {};

  for (const row of rows) {
    const source = toStringValue(row.source_type) || "unknown";
    const tone = toStringValue(row.tone) || "neutral";
    const sourceEntry = bySource[source] || {
      count: 0,
      avgGrade: 0,
      avgEase: 0,
      avgSentLen: 0,
      tones: {},
    };
    sourceEntry.count += 1;
    sourceEntry.avgGrade += toNumber(row.grade);
    sourceEntry.avgEase += toNumber(row.ease);
    sourceEntry.avgSentLen += toNumber(row.avg_sent_len);
    sourceEntry.tones[tone] = (sourceEntry.tones[tone] || 0) + 1;
    bySource[source] = sourceEntry;
  }

  const styleBySource = Object.entries(bySource).map(([source, entry]) => ({
    source,
    count: entry.count,
    avgGrade: round(entry.avgGrade / entry.count, 1),
    avgEase: round(entry.avgEase / entry.count, 1),
    avgSentenceLength: round(entry.avgSentLen / entry.count, 1),
    dominantTone: Object.entries(entry.tones).sort((left, right) => right[1] - left[1])[0]?.[0] || "neutral",
  }));

  const monthlyMap: Record<string, MonthlyEvolutionAccumulator> = {};

  for (const row of rows) {
    const createdAt = toDateValue(row.created_at);
    if (!createdAt) {
      continue;
    }

    const month = createdAt.toISOString().slice(0, 7);
    const entry = monthlyMap[month] || {
      grades: [],
      eases: [],
      sentLens: [],
      wordLens: [],
      vocabs: [],
      count: 0,
      tones: {},
      questionRates: [],
      confidenceRates: [],
    };

    entry.count += 1;
    entry.grades.push(toNumber(row.grade));
    entry.eases.push(toNumber(row.ease));
    entry.sentLens.push(toNumber(row.avg_sent_len));
    entry.wordLens.push(toNumber(row.avg_word_len));
    entry.vocabs.push(toNumber(row.vocab_richness));
    entry.questionRates.push(toNumber(row.question_rate));
    entry.confidenceRates.push(toNumber(row.confidence_rate));
    const tone = toStringValue(row.tone) || "neutral";
    entry.tones[tone] = (entry.tones[tone] || 0) + 1;
    monthlyMap[month] = entry;
  }

  const evolution = Object.entries(monthlyMap)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, entry]) => ({
      month,
      count: entry.count,
      avgGrade: round(average(entry.grades), 1),
      avgEase: round(average(entry.eases), 1),
      avgSentenceLength: round(average(entry.sentLens), 1),
      avgWordLength: round(average(entry.wordLens), 2),
      vocabRichness: round(average(entry.vocabs), 3),
      questionRate: round(average(entry.questionRates), 3),
      confidenceRate: round(average(entry.confidenceRates), 3),
      dominantTone: Object.entries(entry.tones).sort((left, right) => right[1] - left[1])[0]?.[0] || "neutral",
    }));

  const sentenceLengthDistribution: Record<string, number> = {
    "1-5": 0,
    "6-10": 0,
    "11-15": 0,
    "16-20": 0,
    "21-25": 0,
    "26-30": 0,
    "31-40": 0,
    "41+": 0,
  };

  for (const row of rows.slice(0, 200)) {
    const sentences = splitSentences(String(row.content || ""));
    for (const sentence of sentences) {
      const wordCount = sentence.split(/\s+/).filter(Boolean).length;
      if (wordCount === 0) {
        continue;
      }
      if (wordCount <= 5) sentenceLengthDistribution["1-5"] += 1;
      else if (wordCount <= 10) sentenceLengthDistribution["6-10"] += 1;
      else if (wordCount <= 15) sentenceLengthDistribution["11-15"] += 1;
      else if (wordCount <= 20) sentenceLengthDistribution["16-20"] += 1;
      else if (wordCount <= 25) sentenceLengthDistribution["21-25"] += 1;
      else if (wordCount <= 30) sentenceLengthDistribution["26-30"] += 1;
      else if (wordCount <= 40) sentenceLengthDistribution["31-40"] += 1;
      else sentenceLengthDistribution["41+"] += 1;
    }
  }

  const profile: WritingStyleProfile = {
    avgGradeLevel: round(avgGrade, 1),
    medianGradeLevel: round(median(grades), 1),
    readabilityLevel,
    avgReadingEase: round(avgEase, 1),
    easeLabel,
    totalWords,
    uniqueWordCount: uniqueWords.size,
    typeTokenRatio: round(uniqueWords.size / Math.max(1, totalWords), 3),
    avgVocabRichness: round(average(vocabScores), 3),
    rareWordCount: rareWords.length,
    topWords,
    topBigrams,
    topTrigrams,
    avgSentenceLength: round(average(sentenceLengths), 1),
    medianSentenceLength: round(median(sentenceLengths), 1),
    totalSentences: sentenceCounts.reduce((sum, count) => sum + count, 0),
    sentenceLengthDistribution,
    avgWordLength: round(average(wordLengths), 2),
    toneDistribution,
    dominantTone: Object.entries(toneDistribution).sort((left, right) => right[1] - left[1])[0]?.[0] || "neutral",
    avgQuestionRate: round(average(questionRates), 3),
    avgExclamationRate: round(average(exclamationRates), 3),
    avgHedgingRate: round(average(hedgingRates), 3),
    avgConfidenceRate: round(average(confidenceRates), 3),
    complexityScore: computeComplexityScore(
      avgGrade,
      average(sentenceLengths),
      average(wordLengths),
      average(vocabScores),
    ),
    styleBySource,
    evolution,
  };

  return {
    analyzed: rows.length,
    totalEligible,
    profile,
  };
}

export function analyzeText(text: string): TextMetrics {
  const words = extractWords(text);
  const sentences = splitSentences(text);
  const wordCount = words.length;
  const sentenceCount = Math.max(1, sentences.length);

  if (wordCount < 5) {
    return {
      gradeLevel: 0,
      readingEase: 100,
      avgSentenceLength: wordCount,
      avgWordLength: average(words.map((word) => word.length)),
      typeTokenRatio: 1,
      tone: "neutral",
      wordCount,
      sentenceCount,
      questionRate: 0,
      exclamationRate: 0,
      hedgingRate: 0,
      confidenceRate: 0,
    };
  }

  const totalSyllables = words.reduce((sum, word) => sum + countSyllables(word), 0);
  const avgSentenceLength = wordCount / sentenceCount;
  const avgSyllablesPerWord = totalSyllables / wordCount;
  const gradeLevel = Math.max(0, 0.39 * avgSentenceLength + 11.8 * avgSyllablesPerWord - 15.59);
  const readingEase = Math.max(
    0,
    Math.min(100, 206.835 - 1.015 * avgSentenceLength - 84.6 * avgSyllablesPerWord),
  );

  const sampleWords = words.slice(0, 200).map((word) => word.toLowerCase());
  const typeTokenRatio = sampleWords.length > 0 ? new Set(sampleWords).size / sampleWords.length : 0;
  const avgWordLength = average(words.map((word) => word.length));
  const tone = classifyTone(text, words, avgSentenceLength, avgWordLength, avgSyllablesPerWord);
  const questionRate = ((text.match(/\?/g) || []).length) / sentenceCount;
  const exclamationRate = ((text.match(/!/g) || []).length) / sentenceCount;
  const hedgingRate = countPatterns(text, HEDGING_PATTERNS) / sentenceCount;
  const confidenceRate = countPatterns(text, CONFIDENCE_PATTERNS) / sentenceCount;

  return {
    gradeLevel: round(gradeLevel, 1),
    readingEase: round(readingEase, 1),
    avgSentenceLength: round(avgSentenceLength, 1),
    avgWordLength: round(avgWordLength, 2),
    typeTokenRatio: round(typeTokenRatio, 3),
    tone,
    wordCount,
    sentenceCount,
    questionRate: round(questionRate, 3),
    exclamationRate: round(exclamationRate, 3),
    hedgingRate: round(hedgingRate, 3),
    confidenceRate: round(confidenceRate, 3),
  };
}

export function extractWords(text: string): string[] {
  const cleaned = text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\S+@\S+\.\S+/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/[#*_~>\[\]\(\){}|]/g, " ");

  return cleaned.split(/\s+/).filter((word) => /^[a-zA-Z'-]+$/.test(word) && word.length > 0);
}

export function splitSentences(text: string): string[] {
  const sentences = text
    .replace(/\n\n+/g, ". ")
    .split(/(?<=[.!?])\s+(?=[A-Z])|(?<=[.!?])$|\n/)
    .filter((sentence) => sentence.trim().length > 5);

  return sentences.length > 0 ? sentences : [text];
}

export function countSyllables(word: string): number {
  const sanitized = word.toLowerCase().replace(/[^a-z]/g, "");
  if (sanitized.length <= 2) {
    return 1;
  }

  let trimmed = sanitized.replace(/e$/, "");
  if (!trimmed.length) {
    trimmed = sanitized;
  }

  const matches = trimmed.match(/[aeiouy]+/g);
  let count = matches ? matches.length : 1;

  if (/le$/.test(sanitized) && sanitized.length > 3) {
    count += 1;
  }
  if (/(?:ia|io|iu|ua|ue|uo)/.test(sanitized)) {
    count += 1;
  }

  return Math.max(1, count);
}

export function classifyTone(
  text: string,
  words: string[],
  avgSentenceLength: number,
  avgWordLength: number,
  avgSyllablesPerWord: number,
): string {
  const lowerWords = words.map((word) => word.toLowerCase());
  let formalScore = 0;
  let casualScore = 0;
  let technicalScore = 0;

  for (const word of lowerWords) {
    if (FORMAL_WORDS.has(word)) formalScore += 2;
    if (CASUAL_WORDS.has(word)) casualScore += 2;
    if (TECHNICAL_WORDS.has(word)) technicalScore += 2;
  }

  if (avgSentenceLength > 20) formalScore += 3;
  if (avgSentenceLength < 10) casualScore += 3;
  if (avgWordLength > 5.5) formalScore += 2;
  if (avgSyllablesPerWord > 1.7) formalScore += 2;

  const exclamations = (text.match(/!/g) || []).length;
  const questions = (text.match(/\?/g) || []).length;
  if (exclamations > 2) casualScore += 2;
  if (questions > 3) casualScore += 1;

  if (/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}]/u.test(text)) {
    casualScore += 3;
  }

  if (/\b(don't|can't|won't|i'm|you're|they're|we're|it's|that's|what's|there's|here's|let's)\b/i.test(text)) {
    casualScore += 2;
  }

  if (/[{}\[\]<>]|=>|===|&&|\|\|/.test(text)) technicalScore += 3;
  if (/```/.test(text)) technicalScore += 4;

  const scores: Array<[string, number]> = [
    ["formal", formalScore] as [string, number],
    ["casual", casualScore] as [string, number],
    ["technical", technicalScore] as [string, number],
  ];
  scores.sort((left, right) => right[1] - left[1]);

  if ((scores[0]?.[1] || 0) < 3) {
    return "neutral";
  }

  if ((scores[0]?.[1] || 0) - (scores[1]?.[1] || 0) < 2 && (scores[0]?.[1] || 0) > 3) {
    if (
      (scores[0]?.[0] === "formal" && scores[1]?.[0] === "casual")
      || (scores[0]?.[0] === "casual" && scores[1]?.[0] === "formal")
    ) {
      return "conversational";
    }
  }

  return scores[0]?.[0] || "neutral";
}

export function computeComplexityScore(
  avgGrade: number,
  avgSentenceLength: number,
  avgWordLength: number,
  avgVocabulary: number,
) {
  const gradeScore = Math.min(100, (avgGrade / 16) * 100);
  const sentenceScore = Math.min(100, (avgSentenceLength / 30) * 100);
  const wordScore = Math.min(100, ((avgWordLength - 3) / 3) * 100);
  const vocabularyScore = Math.min(100, avgVocabulary * 100);
  const composite = gradeScore * 0.35 + sentenceScore * 0.25 + wordScore * 0.15 + vocabularyScore * 0.25;
  return Math.round(Math.max(0, Math.min(100, composite)));
}

function countPatterns(text: string, patterns: RegExp[]) {
  let count = 0;
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      count += matches.length;
    }
  }
  return count;
}

async function loadAnalyzedRows(userId: string) {
  return await db.execute(sql`
    SELECT
      id, content, source_type, source_title, created_at,
      metadata->>'writing_style_grade' AS grade,
      metadata->>'writing_style_ease' AS ease,
      metadata->>'writing_style_avgSentLen' AS avg_sent_len,
      metadata->>'writing_style_avgWordLen' AS avg_word_len,
      metadata->>'writing_style_vocabRichness' AS vocab_richness,
      metadata->>'writing_style_tone' AS tone,
      metadata->>'writing_style_wordCount' AS word_count,
      metadata->>'writing_style_sentenceCount' AS sentence_count,
      metadata->>'writing_style_questionRate' AS question_rate,
      metadata->>'writing_style_exclamationRate' AS exclamation_rate,
      metadata->>'writing_style_hedgingRate' AS hedging_rate,
      metadata->>'writing_style_confidenceRate' AS confidence_rate
    FROM memories
    WHERE user_id = ${userId}::uuid
      AND metadata->>'writing_style_grade' IS NOT NULL
    ORDER BY created_at ASC
  `) as unknown as WritingStyleDbRow[];
}

async function getEligibleMemoryCount(userId: string) {
  const [row] = await db.execute(sql`
    SELECT COUNT(*) AS count
    FROM memories
    WHERE user_id = ${userId}::uuid
      AND LENGTH(content) > 50
  `) as unknown as Array<{ count?: unknown }>;

  return toInt(row?.count);
}

async function getAnalyzedMemoryCount(userId: string) {
  const [row] = await db.execute(sql`
    SELECT COUNT(*) AS count
    FROM memories
    WHERE user_id = ${userId}::uuid
      AND metadata->>'writing_style_grade' IS NOT NULL
  `) as unknown as Array<{ count?: unknown }>;

  return toInt(row?.count);
}

function normalizeWritingStyleRow(row: WritingStyleDbRow): WritingStyleMemoryResult {
  return {
    id: String(row.id),
    content: String(row.content || "").slice(0, 200),
    sourceType: toStringValue(row.source_type) || "unknown",
    sourceTitle: toStringValue(row.source_title) || "Untitled",
    createdAt: toDateValue(row.created_at)?.toISOString() || null,
    grade: toNumber(row.grade),
    ease: toNumber(row.ease),
    avgSentenceLength: toNumber(row.avg_sent_len),
    avgWordLength: toNumber(row.avg_word_len),
    vocabRichness: toNumber(row.vocab_richness),
    tone: toStringValue(row.tone) || "neutral",
    wordCount: toInt(row.word_count),
    sentenceCount: toInt(row.sentence_count),
    questionRate: toNumber(row.question_rate),
    exclamationRate: toNumber(row.exclamation_rate),
    hedgingRate: toNumber(row.hedging_rate),
    confidenceRate: toNumber(row.confidence_rate),
  };
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] || 0) : ((sorted[mid - 1] || 0) + (sorted[mid] || 0)) / 2;
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInt(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toStringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function toDateValue(value: unknown) {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}
