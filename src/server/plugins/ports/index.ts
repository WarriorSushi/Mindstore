/**
 * Plugin Ports — Portable logic modules
 *
 * Each port extracts core business logic from a plugin's route file,
 * making it framework-agnostic and reusable.
 *
 * All ports use namespaced exports to avoid collisions
 * (many ports export ensureInstalled, runImport, etc.).
 *
 * Shared utilities:
 *   shared-vectors — k-means clustering, cosine similarity, keyword extraction
 *   plugin-config  — ensurePluginInstalled, getPluginConfig, savePluginConfig
 */

// Shared utilities (safe to star-export — unique names)
export * from './shared-vectors';
export * from './plugin-config';

// Import plugins
export * as KindleImporter from './kindle-importer';
export * as VoiceToMemory from './voice-to-memory';
export * as PocketImporter from './pocket-importer';
export * as SpotifyImporter from './spotify-importer';
export * as BrowserBookmarks from './browser-bookmarks';
export * as RedditSaved from './reddit-importer';
export * as TwitterImporter from './twitter-importer';
export * as TelegramImporter from './telegram-importer';
export * as ReadwiseImporter from './readwise-importer';
export * as YouTubeTranscript from './youtube-importer';

// Document parsing
export * as PdfEpubParser from './pdf-epub-parser';

// Analysis plugins
export * as ContradictionFinder from './contradiction-finder';
export * as WritingStyle from './writing-analyzer';
export * as TopicEvolution from './topic-evolution';
export * as SentimentTimeline from './sentiment-timeline';
export * as KnowledgeGaps from './knowledge-gaps';
export * as MindMapGenerator from './mind-map-generator';

// AI plugins
export * as ImageToMemory from './image-to-memory';
export * as CustomRAG from './custom-rag';
export * as DomainEmbeddings from './domain-embeddings';
export * as MultiLanguage from './multi-language';

// Action plugins
export * as BlogDraft from './blog-draft';
export * as ConversationPrep from './conversation-prep';
export * as FlashcardMaker from './flashcard-maker';
export * as LearningPaths from './learning-paths';
export * as NewsletterWriter from './newsletter-writer';
export * as ResumeBuilder from './resume-builder';

// Export plugins
export * as AnkiExport from './anki-export';
export * as MarkdownBlogExport from './markdown-blog-export';

// Notion integration
export * as NotionImporter from './notion-importer';
export * as NotionSync from './notion-sync';

// Obsidian integration
export * as ObsidianImporter from './obsidian-importer';
export * as ObsidianSync from './obsidian-sync';
