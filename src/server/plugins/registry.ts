/**
 * MindStore Plugin Registry
 * 
 * The complete catalog of all available plugins.
 * Each entry has its manifest + metadata for the plugin store.
 */

import { PluginManifest, PluginStoreEntry } from './types';

// ─── PLUGIN MANIFESTS ────────────────────────────────────────────

export const PLUGIN_MANIFESTS: Record<string, PluginManifest> = {
  // ─── Import Plugins ────────────────────────────────────────────
  
  'kindle-importer': {
    slug: 'kindle-importer',
    name: 'Kindle Highlights',
    description: 'Import your Kindle highlights and notes. Groups by book with location markers.',
    version: '1.0.0',
    type: 'extension',
    category: 'import',
    icon: 'BookOpen',
    author: 'MindStore',
    capabilities: ['write:memories', 'files:read'],
    hooks: ['onInstall', 'onUninstall'],
    ui: {
      importTab: {
        label: 'Kindle',
        icon: 'BookOpen',
        acceptedFileTypes: ['.txt'],
      },
      settingsSchema: [
        {
          key: 'dedup',
          label: 'Deduplicate highlights',
          description: 'Skip highlights that are already in your knowledge base',
          type: 'boolean',
          default: true,
        },
      ],
    },
  },

  'pdf-epub-parser': {
    slug: 'pdf-epub-parser',
    name: 'PDF & EPUB Parser',
    description: 'Smart document parsing with chapter structure, headings, and section-aware chunking.',
    version: '1.0.0',
    type: 'extension',
    category: 'import',
    icon: 'FileText',
    author: 'MindStore',
    capabilities: ['write:memories', 'files:read', 'write:embeddings'],
    hooks: ['onInstall', 'onUninstall'],
    ui: {
      importTab: {
        label: 'Documents',
        icon: 'FileText',
        acceptedFileTypes: ['.pdf', '.epub'],
      },
    },
  },

  'youtube-importer': {
    slug: 'youtube-importer',
    aliases: ['youtube-transcript'],
    name: 'YouTube Transcripts',
    description: 'Import transcripts from YouTube videos. Paste a URL and get the full transcript.',
    version: '1.0.0',
    type: 'extension',
    category: 'import',
    icon: 'Play',
    author: 'MindStore',
    capabilities: ['write:memories', 'network:fetch', 'write:embeddings'],
    hooks: ['onInstall', 'onUninstall'],
    ui: {
      importTab: {
        label: 'YouTube',
        icon: 'Play',
        acceptedFileTypes: [],
      },
    },
  },

  'browser-bookmarks': {
    slug: 'browser-bookmarks',
    name: 'Browser Bookmarks',
    description: 'Import bookmarks from Chrome, Firefox, or Safari. Optionally fetch full page content.',
    version: '1.0.0',
    type: 'extension',
    category: 'import',
    icon: 'Bookmark',
    author: 'MindStore',
    capabilities: ['write:memories', 'files:read', 'network:fetch'],
    hooks: ['onInstall', 'onUninstall'],
    ui: {
      importTab: {
        label: 'Bookmarks',
        icon: 'Bookmark',
        acceptedFileTypes: ['.html'],
      },
    },
  },

  'obsidian-importer': {
    slug: 'obsidian-importer',
    name: 'Obsidian Vault Import',
    description: 'Import an entire Obsidian vault with wikilinks, tags, frontmatter, and graph structure.',
    version: '1.0.0',
    type: 'extension',
    category: 'import',
    icon: 'Gem',
    author: 'MindStore',
    capabilities: ['write:memories', 'files:read', 'write:embeddings'],
    hooks: ['onInstall', 'onUninstall'],
    ui: {
      importTab: {
        label: 'Obsidian',
        icon: 'Gem',
        acceptedFileTypes: ['.zip'],
      },
    },
  },

  'reddit-importer': {
    slug: 'reddit-importer',
    aliases: ['reddit-saved'],
    name: 'Reddit Saved Posts',
    description: 'Import your saved posts and comments from Reddit\'s data export.',
    version: '1.0.0',
    type: 'extension',
    category: 'import',
    icon: 'MessageCircle',
    author: 'MindStore',
    capabilities: ['write:memories', 'files:read'],
    hooks: ['onInstall', 'onUninstall'],
    ui: {
      importTab: {
        label: 'Reddit',
        icon: 'MessageCircle',
        acceptedFileTypes: ['.csv', '.json'],
      },
    },
  },

  'twitter-importer': {
    slug: 'twitter-importer',
    name: 'Twitter/X Bookmarks',
    description: 'Import saved tweets and bookmarks. Preserves thread context and author info.',
    version: '1.0.0',
    type: 'extension',
    category: 'import',
    icon: 'AtSign',
    author: 'MindStore',
    capabilities: ['write:memories', 'files:read', 'network:fetch'],
    hooks: ['onInstall', 'onUninstall'],
  },

  'readwise-importer': {
    slug: 'readwise-importer',
    name: 'Readwise Highlights',
    description: 'Import all your Readwise highlights — books, articles, tweets, podcasts.',
    version: '1.0.0',
    type: 'extension',
    category: 'import',
    icon: 'Highlighter',
    author: 'MindStore',
    capabilities: ['write:memories', 'network:fetch', 'write:embeddings'],
    hooks: ['onInstall', 'onUninstall'],
  },

  'pocket-importer': {
    slug: 'pocket-importer',
    name: 'Pocket / Instapaper',
    description: 'Import saved articles from Pocket or Instapaper with full text extraction.',
    version: '1.0.0',
    type: 'extension',
    category: 'import',
    icon: 'BookmarkCheck',
    author: 'MindStore',
    capabilities: ['write:memories', 'files:read', 'network:fetch'],
    hooks: ['onInstall', 'onUninstall'],
  },

  'telegram-importer': {
    slug: 'telegram-importer',
    name: 'Telegram Messages',
    description: 'Import Telegram saved messages and channel history from data exports.',
    version: '1.0.0',
    type: 'extension',
    category: 'import',
    icon: 'Send',
    author: 'MindStore',
    capabilities: ['write:memories', 'files:read'],
    hooks: ['onInstall', 'onUninstall'],
  },

  'spotify-importer': {
    slug: 'spotify-importer',
    name: 'Spotify Listening History',
    description: 'Import listening history and build a music taste profile as knowledge.',
    version: '1.0.0',
    type: 'extension',
    category: 'import',
    icon: 'Music',
    author: 'MindStore',
    capabilities: ['write:memories', 'files:read'],
    hooks: ['onInstall', 'onUninstall'],
  },

  'notion-importer': {
    slug: 'notion-importer',
    name: 'Notion Import (Enhanced)',
    description: 'Full Notion workspace import with database support, not just pages. Upload your Notion export ZIP with CSV databases.',
    version: '1.0.0',
    type: 'extension',
    category: 'import',
    icon: 'FileStack',
    author: 'MindStore',
    capabilities: ['write:memories', 'files:read', 'write:embeddings'],
    hooks: ['onInstall', 'onUninstall'],
    ui: {
      importTab: {
        label: 'Notion',
        icon: 'FileStack',
        acceptedFileTypes: ['.zip'],
      },
    },
  },

  // ─── Analysis Plugins ─────────────────────────────────────────

  'mind-map-generator': {
    slug: 'mind-map-generator',
    name: 'Mind Map Generator',
    description: 'Auto-generate interactive mind maps from your memories. Visual knowledge topology.',
    version: '1.0.0',
    type: 'extension',
    category: 'analysis',
    icon: 'Network',
    author: 'MindStore',
    capabilities: ['read:memories', 'read:embeddings', 'ui:pages'],
    hooks: ['onInstall', 'onUninstall', 'onDashboard'],
    ui: {
      pages: [{ path: 'map', title: 'Mind Map', icon: 'Network', showInSidebar: false }],
    },
  },

  'knowledge-gaps': {
    slug: 'knowledge-gaps',
    name: 'Knowledge Gaps Analyzer',
    description: 'Identifies blind spots in your knowledge by analyzing what\'s missing.',
    version: '1.0.0',
    type: 'extension',
    category: 'analysis',
    icon: 'SearchX',
    author: 'MindStore',
    capabilities: ['read:memories', 'read:embeddings', 'chat:generate', 'ui:widgets'],
    hooks: ['onInstall', 'onUninstall'],
  },

  'contradiction-finder': {
    slug: 'contradiction-finder',
    name: 'Contradiction Finder',
    description: 'Scans memories for conflicting beliefs, outdated info, and inconsistencies.',
    version: '1.0.0',
    type: 'extension',
    category: 'analysis',
    icon: 'AlertTriangle',
    author: 'MindStore',
    capabilities: ['read:memories', 'chat:generate', 'background:jobs'],
    hooks: ['onInstall', 'onUninstall'],
  },

  'topic-evolution': {
    slug: 'topic-evolution',
    name: 'Topic Evolution Timeline',
    description: 'Visualize how your interests and knowledge evolved over time.',
    version: '1.0.0',
    type: 'extension',
    category: 'analysis',
    icon: 'TrendingUp',
    author: 'MindStore',
    capabilities: ['read:memories', 'read:embeddings', 'ui:pages'],
    hooks: ['onInstall', 'onUninstall'],
    ui: {
      pages: [{ path: 'evolution', title: 'Evolution', icon: 'TrendingUp', showInSidebar: false }],
    },
  },

  'writing-analyzer': {
    slug: 'writing-analyzer',
    aliases: ['writing-style'],
    name: 'Writing Style Analyzer',
    description: 'Analyze your writing style — vocabulary, tone, complexity, and patterns.',
    version: '1.0.0',
    type: 'mcp',
    category: 'analysis',
    icon: 'PenLine',
    author: 'MindStore',
    capabilities: ['read:memories', 'ui:widgets'],
    hooks: ['onInstall', 'onUninstall'],
    ui: {
      dashboardWidgets: [
        {
          id: 'writing-style-overview',
          title: 'Writing Style Overview',
          description: 'Snapshot of your written-memory volume, recency, and dominant source.',
          size: 'medium',
          priority: 50,
          emptyState: 'Import or write a few memories to generate your first writing profile.',
        },
      ],
    },
  },

  'sentiment-timeline': {
    slug: 'sentiment-timeline',
    name: 'Sentiment Timeline',
    description: 'Track the emotional arc of your thoughts with mood analysis over time.',
    version: '1.0.0',
    type: 'extension',
    category: 'analysis',
    icon: 'Heart',
    author: 'MindStore',
    capabilities: ['read:memories', 'chat:generate', 'background:jobs', 'ui:widgets'],
    hooks: ['onInstall', 'onUninstall'],
  },

  // ─── Action Plugins ───────────────────────────────────────────

  'blog-draft': {
    slug: 'blog-draft',
    name: 'Blog Draft Generator',
    description: 'Turn your memories into polished blog posts using AI and your own knowledge.',
    version: '1.0.0',
    type: 'extension',
    category: 'action',
    icon: 'PenSquare',
    author: 'MindStore',
    capabilities: ['read:memories', 'read:embeddings', 'chat:generate', 'ui:pages'],
    hooks: ['onInstall', 'onUninstall'],
    ui: {
      pages: [{ path: 'write', title: 'Write', icon: 'PenSquare', showInSidebar: true }],
    },
  },

  'flashcard-maker': {
    slug: 'flashcard-maker',
    name: 'Flashcard Maker',
    description: 'Auto-generate spaced repetition flashcards from your memories with built-in review.',
    version: '1.0.0',
    type: 'extension',
    category: 'action',
    icon: 'Layers',
    author: 'MindStore',
    capabilities: ['read:memories', 'chat:generate', 'ui:pages'],
    hooks: ['onInstall', 'onUninstall'],
  },

  'newsletter-writer': {
    slug: 'newsletter-writer',
    name: 'Newsletter Writer',
    description: 'Auto-curate a weekly digest from what you\'ve learned. Edit and send.',
    version: '1.0.0',
    type: 'extension',
    category: 'action',
    icon: 'Mail',
    author: 'MindStore',
    capabilities: ['read:memories', 'chat:generate', 'background:jobs', 'ui:pages'],
    hooks: ['onInstall', 'onUninstall'],
  },

  'resume-builder': {
    slug: 'resume-builder',
    name: 'Resume Builder',
    description: 'Build and maintain a resume from your professional memories. Export to PDF.',
    version: '1.0.0',
    type: 'extension',
    category: 'action',
    icon: 'FileUser',
    author: 'MindStore',
    capabilities: ['read:memories', 'chat:generate', 'files:write', 'ui:pages'],
    hooks: ['onInstall', 'onUninstall'],
  },

  'conversation-prep': {
    slug: 'conversation-prep',
    name: 'Conversation Prep',
    description: 'Get briefed before a meeting. "What do I know about this person/topic?" — structured briefing with talking points.',
    version: '1.0.0',
    type: 'extension',
    category: 'action',
    icon: 'Users',
    author: 'MindStore',
    capabilities: ['read:memories', 'read:embeddings', 'chat:generate', 'ui:pages'],
    hooks: ['onInstall', 'onUninstall'],
    ui: {
      pages: [{ path: 'prep', title: 'Prep', icon: 'Users', showInSidebar: true }],
    },
    mcpTools: [{
      name: 'prepare_briefing',
      description: 'Generate a comprehensive briefing about a person or topic from your knowledge',
      inputSchema: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Person name or topic to brief on' },
        },
        required: ['topic'],
      },
    }],
  },

  'learning-paths': {
    slug: 'learning-paths',
    name: 'Learning Path Generator',
    description: 'Suggest what to learn next based on knowledge gaps. Structured learning plans.',
    version: '1.0.0',
    type: 'extension',
    category: 'action',
    icon: 'Route',
    author: 'MindStore',
    capabilities: ['read:memories', 'read:embeddings', 'chat:generate', 'ui:pages'],
    hooks: ['onInstall', 'onUninstall'],
  },

  // ─── Export/Sync Plugins ──────────────────────────────────────

  'obsidian-sync': {
    slug: 'obsidian-sync',
    name: 'Obsidian Vault Sync',
    description: 'Two-way sync between MindStore and your Obsidian vault. Export as .md with frontmatter, wikilinks, and backlinks.',
    version: '1.0.0',
    type: 'extension',
    category: 'export',
    icon: 'RefreshCw',
    author: 'MindStore',
    capabilities: ['read:memories', 'write:memories', 'files:read', 'files:write', 'background:jobs'],
    hooks: ['onInstall', 'onUninstall', 'onMemoryCreate', 'onMemoryUpdate'],
    ui: {
      pages: [{ path: 'obsidian-sync', title: 'Obsidian Sync', icon: 'Gem', showInSidebar: true }],
    },
  },

  'notion-sync': {
    slug: 'notion-sync',
    name: 'Notion Sync',
    description: 'Push MindStore memories to a Notion database. Structured properties, source types, tags, and full content.',
    version: '1.0.0',
    type: 'extension',
    category: 'export',
    icon: 'FileStack',
    author: 'MindStore',
    capabilities: ['read:memories', 'network:fetch', 'background:jobs'],
    hooks: ['onInstall', 'onUninstall', 'onMemoryCreate'],
    ui: {
      pages: [{ path: 'notion-sync', title: 'Notion Sync', icon: 'FileStack', showInSidebar: true }],
    },
  },

  'anki-export': {
    slug: 'anki-export',
    name: 'Anki Deck Export',
    description: 'Export flashcards as Anki-compatible .apkg decks. Supports TSV (Anki native) and CSV (universal) formats with full SM-2 metadata.',
    version: '1.0.0',
    type: 'extension',
    category: 'export',
    icon: 'Download',
    author: 'MindStore',
    capabilities: ['read:memories', 'files:write'],
    hooks: ['onInstall', 'onUninstall'],
    ui: {
      pages: [{ path: 'anki', title: 'Anki Export', icon: 'Download', showInSidebar: true }],
    },
  },

  'markdown-blog-export': {
    slug: 'markdown-blog-export',
    name: 'Markdown Blog Export',
    description: 'Export memories as blog-ready markdown with frontmatter. Supports Hugo, Jekyll, Astro, Next.js, and plain markdown.',
    version: '1.0.0',
    type: 'extension',
    category: 'export',
    icon: 'FolderDown',
    author: 'MindStore',
    capabilities: ['read:memories', 'files:write'],
    hooks: ['onInstall', 'onUninstall'],
    ui: {
      pages: [{ path: 'export', title: 'Blog Export', icon: 'FolderDown', showInSidebar: true }],
    },
  },

  // ─── AI Enhancement Plugins ───────────────────────────────────

  'voice-to-memory': {
    slug: 'voice-to-memory',
    name: 'Voice-to-Memory',
    description: 'Record voice → transcribe → save as memory. Think-aloud capture with Whisper.',
    version: '1.0.0',
    type: 'extension',
    category: 'ai',
    icon: 'Mic',
    author: 'MindStore',
    capabilities: ['write:memories', 'network:fetch', 'files:read'],
    hooks: ['onInstall', 'onUninstall'],
    ui: {
      pages: [{ path: 'voice', title: 'Voice', icon: 'Mic', showInSidebar: true }],
    },
  },

  'image-to-memory': {
    slug: 'image-to-memory',
    name: 'Image-to-Memory',
    description: 'Upload images → AI describes them → saves as searchable memory.',
    version: '1.0.0',
    type: 'extension',
    category: 'ai',
    icon: 'Image',
    author: 'MindStore',
    capabilities: ['write:memories', 'chat:generate', 'files:read'],
    hooks: ['onInstall', 'onUninstall'],
  },

  'multi-language': {
    slug: 'multi-language',
    name: 'Multi-Language Support',
    description: 'Store and search memories in any language. Cross-language semantic search.',
    version: '1.0.0',
    type: 'extension',
    category: 'ai',
    icon: 'Languages',
    author: 'MindStore',
    capabilities: ['read:memories', 'write:embeddings', 'chat:generate', 'ui:pages'],
    hooks: ['onInstall', 'onUninstall', 'onImport', 'onSearch'],
    ui: {
      pages: [{ path: 'languages', title: 'Languages', icon: 'Languages', showInSidebar: true }],
    },
  },

  'custom-rag': {
    slug: 'custom-rag',
    name: 'Custom RAG Strategies',
    description: 'Swap retrieval strategies: HyDE, reranking, parent-child chunking, contextual compression, and more.',
    version: '1.0.0',
    type: 'extension',
    category: 'ai',
    icon: 'Cog',
    author: 'MindStore',
    capabilities: ['read:memories', 'read:embeddings', 'chat:generate'],
    hooks: ['onInstall', 'onUninstall', 'onSearch'],
    ui: {
      pages: [{ path: 'retrieval', title: 'Retrieval', icon: 'Cog', showInSidebar: true }],
    },
  },

  'domain-embeddings': {
    slug: 'domain-embeddings',
    name: 'Domain-Specific Embeddings',
    description: 'Use specialized embedding models for medical, legal, code, and financial domains. Better search for specialized content.',
    version: '1.0.0',
    type: 'extension',
    category: 'ai',
    icon: 'Dna',
    author: 'MindStore',
    capabilities: ['write:embeddings', 'read:memories', 'ui:pages'],
    hooks: ['onInstall', 'onUninstall'],
    ui: {
      pages: [{ path: 'domains', title: 'Domains', icon: 'Dna', showInSidebar: true }],
    },
  },
};

// ─── STORE CATALOG ───────────────────────────────────────────────

/**
 * Build the plugin store catalog from manifests.
 * Merges manifest data with installation status from DB.
 */
export function buildStoreCatalog(
  installedPlugins: Map<string, { status: string; config: Record<string, unknown> }>
): PluginStoreEntry[] {
  return Object.values(PLUGIN_MANIFESTS).map((manifest) => {
    const installed = installedPlugins.get(manifest.slug);
    return {
      slug: manifest.slug,
      name: manifest.name,
      description: manifest.description,
      version: manifest.version,
      type: manifest.type,
      category: manifest.category,
      icon: manifest.icon,
      author: manifest.author,
      capabilities: manifest.capabilities,
      installed: !!installed,
      status: installed?.status as any,
      featured: FEATURED_PLUGINS.includes(manifest.slug),
      tags: buildTags(manifest),
    };
  });
}

// Plugins featured in the store (shown prominently)
const FEATURED_PLUGINS = [
  'kindle-importer',
  'youtube-importer',
  'mind-map-generator',
  'flashcard-maker',
  'voice-to-memory',
  'blog-draft',
];

function buildTags(manifest: PluginManifest): string[] {
  const tags: string[] = [manifest.category];
  if (manifest.type === 'mcp') tags.push('mcp');
  if (manifest.type === 'prompt') tags.push('config-only');
  if (manifest.capabilities?.includes('network:fetch')) tags.push('network');
  if (manifest.capabilities?.includes('background:jobs')) tags.push('background');
  if (manifest.ui?.importTab) tags.push('file-upload');
  if (manifest.ui?.pages?.length) tags.push('has-pages');
  return tags;
}

/**
 * Get a single plugin manifest by slug.
 */
export function getPluginManifest(slug: string): PluginManifest | undefined {
  return PLUGIN_MANIFESTS[slug];
}

/**
 * Get all plugin slugs for a given category.
 */
export function getPluginsByCategory(category: string): PluginManifest[] {
  return Object.values(PLUGIN_MANIFESTS).filter((m) => m.category === category);
}
