import { pgTable, uuid, text, real, integer, timestamp, jsonb, index, uniqueIndex, pgEnum, customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Custom vector type for pgvector — no fixed dimension so any provider (OpenAI 1536, Gemini 768, Ollama 768) works
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value);
  },
});

// Enums
export const contentTypeEnum = pgEnum('content_type', [
  'text', 'image', 'audio', 'video', 'code', 'conversation', 'webpage', 'document',
]);

// === CORE TABLES ===

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').unique(),
  name: text('name'),
  image: text('image'),
  settings: jsonb('settings').default({}),
  createdAt: timestamp('created_at').defaultNow(),
});

export const memories = pgTable('memories', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding'),
  contentType: contentTypeEnum('content_type').default('text'),
  sourceType: text('source_type').notNull(), // obsidian, notion, chatgpt, claude, text, url, image, audio
  sourceId: text('source_id'),
  sourceTitle: text('source_title'),
  metadata: jsonb('metadata').default({}),
  parentId: uuid('parent_id'), // for hierarchical indexing
  treePath: text('tree_path'), // materialized path: root/section/subsection
  createdAt: timestamp('created_at').defaultNow(),
  importedAt: timestamp('imported_at').defaultNow(),
}, (table) => [
  index('idx_memories_user').on(table.userId),
  index('idx_memories_source').on(table.userId, table.sourceType),
  index('idx_memories_tree').on(table.userId, table.treePath),
  index('idx_memories_created').on(table.userId, table.createdAt),
]);

// Tree index for hierarchical retrieval (PageIndex-inspired)
export const treeIndex = pgTable('tree_index', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  level: integer('level').default(0), // 0=root, 1=category, 2=topic, 3=subtopic
  parentId: uuid('parent_id'),
  memoryIds: uuid('memory_ids').array(),
  embedding: vector('embedding'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_tree_user').on(table.userId),
  index('idx_tree_parent').on(table.parentId),
]);

export const profile = pgTable('profile', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  category: text('category').default('general'),
  confidence: real('confidence').default(0.5),
  source: text('source').default('manual'),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  uniqueIndex('idx_profile_user_key').on(table.userId, table.key),
]);

export const facts = pgTable('facts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  fact: text('fact').notNull(),
  category: text('category'),
  entities: text('entities').array(), // extracted named entities
  learnedAt: timestamp('learned_at').defaultNow(),
  source: text('source').default('conversation'),
}, (table) => [
  index('idx_facts_user').on(table.userId),
]);

// Cross-pollination cache
export const connections = pgTable('connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  memoryAId: uuid('memory_a_id').references(() => memories.id),
  memoryBId: uuid('memory_b_id').references(() => memories.id),
  similarity: real('similarity'),
  surprise: real('surprise'),
  bridgeConcept: text('bridge_concept'),
  discoveredAt: timestamp('discovered_at').defaultNow(),
});

export const contradictions = pgTable('contradictions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  memoryAId: uuid('memory_a_id').references(() => memories.id),
  memoryBId: uuid('memory_b_id').references(() => memories.id),
  topic: text('topic'),
  description: text('description'),
  detectedAt: timestamp('detected_at').defaultNow(),
});

// Media storage metadata
export const media = pgTable('media', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  memoryId: uuid('memory_id').references(() => memories.id),
  fileType: text('file_type').notNull(), // image/png, audio/mp3, etc.
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size'),
  metadata: jsonb('metadata').default({}), // EXIF, dimensions, duration
  transcript: text('transcript'), // for audio/video
  createdAt: timestamp('created_at').defaultNow(),
});

// OAuth accounts (NextAuth)
export const accounts = pgTable('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refreshToken: text('refresh_token'),
  accessToken: text('access_token'),
  expiresAt: integer('expires_at'),
  tokenType: text('token_type'),
  scope: text('scope'),
  idToken: text('id_token'),
});

// Sessions (NextAuth)
export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  sessionToken: text('session_token').unique().notNull(),
  expires: timestamp('expires').notNull(),
});

// App settings (API keys, config)
export const settings = pgTable('settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').unique().notNull(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// === PLUGIN SYSTEM ===

export const pluginTypeEnum = pgEnum('plugin_type', ['extension', 'mcp', 'prompt']);
export const pluginStatusEnum = pgEnum('plugin_status', ['installed', 'active', 'disabled', 'error']);

export const plugins = pgTable('plugins', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').unique().notNull(), // unique identifier e.g. 'kindle-importer'
  name: text('name').notNull(),
  description: text('description'),
  version: text('version').default('1.0.0'),
  type: pluginTypeEnum('type').notNull().default('extension'),
  status: pluginStatusEnum('status').notNull().default('installed'),
  icon: text('icon'), // lucide icon name
  category: text('category'), // 'import', 'analysis', 'action', 'export', 'ai'
  author: text('author').default('MindStore'),
  config: jsonb('config').default({}), // plugin-specific settings
  metadata: jsonb('metadata').default({}), // capabilities, hooks, routes info
  installedAt: timestamp('installed_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  lastError: text('last_error'),
}, (table) => [
  index('idx_plugins_slug').on(table.slug),
  index('idx_plugins_status').on(table.status),
  index('idx_plugins_category').on(table.category),
]);

export const pluginJobSchedules = pgTable('plugin_job_schedules', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  pluginSlug: text('plugin_slug').notNull(),
  jobId: text('job_id').notNull(),
  enabled: integer('enabled').default(1).notNull(),
  intervalMinutes: integer('interval_minutes').default(1440).notNull(),
  nextRunAt: timestamp('next_run_at'),
  lastRunAt: timestamp('last_run_at'),
  lastStatus: text('last_status'),
  lastSummary: text('last_summary'),
  lastError: text('last_error'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  uniqueIndex('idx_plugin_job_schedule_user_plugin_job').on(table.userId, table.pluginSlug, table.jobId),
  index('idx_plugin_job_schedule_due').on(table.enabled, table.nextRunAt),
]);

export const flashcardDecks = pgTable('flashcard_decks', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color').notNull(),
  cards: jsonb('cards').default([]).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_flashcard_decks_user').on(table.userId),
  index('idx_flashcard_decks_updated').on(table.updatedAt),
]);

export const voiceRecordings = pgTable('voice_recordings', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  title: text('title'),
  transcript: text('transcript'),
  durationSeconds: real('duration_seconds'),
  audioSize: integer('audio_size'),
  audioFormat: text('audio_format').default('webm'),
  language: text('language'),
  provider: text('provider'),
  model: text('model'),
  confidence: real('confidence'),
  wordCount: integer('word_count'),
  savedAsMemory: integer('saved_as_memory').default(0).notNull(),
  memoryId: uuid('memory_id').references(() => memories.id),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_voice_recordings_user').on(table.userId),
  index('idx_voice_recordings_created').on(table.createdAt),
  index('idx_voice_recordings_saved').on(table.savedAsMemory),
]);

// API Keys (for MCP server auth)
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  key: text('key').unique().notNull(),
  name: text('name'),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// === TAGS SYSTEM ===

export const tags = pgTable('tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  color: text('color').default('teal'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  uniqueIndex('idx_tags_user_name').on(table.userId, table.name),
  index('idx_tags_user').on(table.userId),
]);

export const memoryTags = pgTable('memory_tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  memoryId: uuid('memory_id').references(() => memories.id, { onDelete: 'cascade' }).notNull(),
  tagId: uuid('tag_id').references(() => tags.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  uniqueIndex('idx_memory_tags_unique').on(table.memoryId, table.tagId),
  index('idx_memory_tags_memory').on(table.memoryId),
  index('idx_memory_tags_tag').on(table.tagId),
]);

// === NOTIFICATIONS SYSTEM ===

export const notificationTypeEnum = pgEnum('notification_type', [
  'import_complete',      // "45 Kindle highlights imported"
  'analysis_ready',       // "Contradiction scan found 3 conflicts"
  'review_due',           // "12 flashcards due for review"
  'plugin_event',         // generic plugin activity
  'system',               // app updates, tips, onboarding
  'export_ready',         // "Anki deck ready for download"
  'connection_found',     // "New connection discovered between X and Y"
  'milestone',            // "You've reached 1,000 memories!"
]);

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  type: notificationTypeEnum('type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  icon: text('icon'),                           // lucide icon name
  color: text('color').default('teal'),         // teal, sky, emerald, amber, red
  href: text('href'),                           // optional deep link to relevant page
  pluginSlug: text('plugin_slug'),              // which plugin generated this
  metadata: jsonb('metadata').default({}),       // extra data (count, ids, etc.)
  read: integer('read').default(0),              // 0=unread, 1=read (using integer for SQLite compat)
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_notifications_user').on(table.userId),
  index('idx_notifications_user_read').on(table.userId, table.read),
  index('idx_notifications_created').on(table.createdAt),
]);

export const searchHistory = pgTable('search_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  query: text('query').notNull(),
  resultCount: integer('result_count').default(0),
  searchedAt: timestamp('searched_at').defaultNow(),
}, (table) => [
  index('idx_search_history_user').on(table.userId, table.searchedAt),
]);

export const chatConversations = pgTable('chat_conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  title: text('title').notNull().default('New conversation'),
  messages: jsonb('messages').default([]).notNull(),
  model: text('model'),
  memoryCount: integer('memory_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_chat_convos_user').on(table.userId, table.updatedAt),
]);

export const memoryReviews = pgTable('memory_reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  memoryId: uuid('memory_id').references(() => memories.id, { onDelete: 'cascade' }).notNull(),
  reviewCount: integer('review_count').default(0),
  nextReviewAt: timestamp('next_review_at').notNull(),
  lastReviewedAt: timestamp('last_reviewed_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  uniqueIndex('idx_memory_reviews_unique').on(table.userId, table.memoryId),
  index('idx_memory_reviews_due').on(table.userId, table.nextReviewAt),
]);

export const imageAnalyses = pgTable('image_analyses', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  title: text('title'),
  description: text('description'),
  imageData: text('image_data'),
  imageSize: integer('image_size'),
  imageFormat: text('image_format').default('png'),
  imageWidth: integer('image_width'),
  imageHeight: integer('image_height'),
  tags: text('tags').array().default(sql`'{}'::text[]`),
  contextType: text('context_type').default('general'),
  provider: text('provider'),
  model: text('model'),
  wordCount: integer('word_count'),
  savedAsMemory: integer('saved_as_memory').default(0).notNull(),
  memoryId: uuid('memory_id').references(() => memories.id),
  customPrompt: text('custom_prompt'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_image_analyses_user').on(table.userId, table.createdAt),
]);

export const indexingJobs = pgTable('indexing_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  jobType: text('job_type').notNull(),
  status: text('status').notNull().default('pending'),
  reason: text('reason'),
  provider: text('provider'),
  requestedCount: integer('requested_count').default(0).notNull(),
  processedCount: integer('processed_count').default(0).notNull(),
  remainingCount: integer('remaining_count').default(0).notNull(),
  lastError: text('last_error'),
  metadata: jsonb('metadata').default({}).notNull(),
  scheduledAt: timestamp('scheduled_at').defaultNow(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_indexing_jobs_user').on(table.userId, table.scheduledAt),
  index('idx_indexing_jobs_status').on(table.status, table.scheduledAt),
  index('idx_indexing_jobs_user_type').on(table.userId, table.jobType, table.status),
]);

// === PHASE 3 INNOVATION A.4: FORGETTING CURVE (WHOLE BASE) ===
// Per FEATURE_BACKLOG.md A.4. Applies Ebbinghaus's R = e^(-t/S) decay
// to *every* memory, not just the ones the user made flashcards for.
// The weekly scorer ranks memories by forgetting risk so the
// /app/forgetting page can surface them for review.

export const memoryForgettingRisk = pgTable('memory_forgetting_risk', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  memoryId: uuid('memory_id').references(() => memories.id, { onDelete: 'cascade' }).notNull(),
  riskScore: real('risk_score').notNull(), // 0..1, 1 = about to forget
  daysSinceTouch: integer('days_since_touch').notNull(),
  recommendationPriority: integer('recommendation_priority').notNull(), // 1..5
  computedAt: timestamp('computed_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_forgetting_risk_unique').on(table.userId, table.memoryId),
  index('idx_forgetting_risk_user_score').on(table.userId, table.riskScore),
]);

// === PHASE 2 INNOVATION A.2: KNOWLEDGE FINGERPRINT SNAPSHOTS ===
// Per FEATURE_BACKLOG.md A.2. A weekly snapshot of the user's knowledge
// topology — memory_count, source_breakdown, cluster_centroids, plus a
// renderable SVG badge. Mind Diff (A.5) compares two of these to produce
// "what changed in your thinking between these two dates" reports.

export const mindSnapshots = pgTable('mind_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  takenAt: timestamp('taken_at').defaultNow().notNull(),
  memoryCount: integer('memory_count').default(0).notNull(),
  sourceBreakdown: jsonb('source_breakdown').default({}).notNull(),
  clusterCentroids: jsonb('cluster_centroids').default([]).notNull(),
  topTopics: jsonb('top_topics').default([]).notNull(),
  fingerprintSvg: text('fingerprint_svg'),
  trigger: text('trigger').default('manual').notNull(), // 'cron' | 'manual'
}, (table) => [
  index('idx_mind_snapshots_user').on(table.userId, table.takenAt),
]);

// === PHASE 2 INNOVATION: KNOWLEDGE METABOLISM SCORE ===
// Tracks weekly intellectual fitness as a 0-10 score plus four components.
// Per FEATURE_BACKLOG.md A.9. Computed via src/server/metabolism/calc.ts.

export const metabolismScores = pgTable('metabolism_scores', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  weekStart: timestamp('week_start').notNull(), // Sunday 00:00 UTC of the week
  score: real('score').notNull(), // overall 0-10 weighted average
  intakeRate: real('intake_rate').notNull(), // memories added vs trailing average
  connectionDensity: real('connection_density').notNull(), // connections per memory
  retrievalFrequency: real('retrieval_frequency').notNull(), // searches+chats per day
  growthVelocity: real('growth_velocity').notNull(), // week-over-week delta
  memoriesAdded: integer('memories_added').default(0).notNull(),
  searchesPerformed: integer('searches_performed').default(0).notNull(),
  chatsPerformed: integer('chats_performed').default(0).notNull(),
  computedAt: timestamp('computed_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_metabolism_user_week').on(table.userId, table.weekStart),
  index('idx_metabolism_user').on(table.userId, table.weekStart),
]);
