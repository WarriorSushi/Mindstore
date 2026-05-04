'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plug, Plus, Copy, Check, Loader2, KeyRound, AlertTriangle, Eye, EyeOff, Sparkles } from 'lucide-react';
import { PageTransition } from '@/components/PageTransition';
import { usePageTitle } from '@/lib/use-page-title';

interface ApiKey {
  id: string;
  name: string;
  createdAt: string | null;
  lastUsedAt: string | null;
}

const PLACEHOLDER = 'YOUR_MINDSTORE_API_KEY';

interface ClientConfig {
  id: string;
  name: string;
  blurb: string;
  configPath?: string;
  language: 'json' | 'toml' | 'yaml' | 'bash';
  build: (origin: string, key: string) => string;
}

const CLIENTS: ClientConfig[] = [
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    blurb: 'Anthropic\'s official Mac/Windows app. Supports remote HTTP MCP servers via the mcp-remote shim.',
    configPath: 'macOS: ~/Library/Application Support/Claude/claude_desktop_config.json\nWindows: %APPDATA%\\Claude\\claude_desktop_config.json',
    language: 'json',
    build: (origin, key) =>
      JSON.stringify(
        {
          mcpServers: {
            mindstore: {
              command: 'npx',
              args: [
                '-y',
                'mcp-remote',
                `${origin}/api/mcp`,
                '--header',
                `Authorization: Bearer ${key}`,
              ],
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    blurb: 'Anthropic\'s CLI-based coding agent. Add MindStore with a single command.',
    configPath: 'Run from any directory; the config is saved to your Claude Code profile.',
    language: 'bash',
    build: (origin, key) =>
      `claude mcp add --transport http mindstore ${origin}/api/mcp \\\n  --header "Authorization: Bearer ${key}"`,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    blurb: 'AI-first code editor. Native HTTP MCP support.',
    configPath: '~/.cursor/mcp.json (or via Settings → Cursor Settings → MCP)',
    language: 'json',
    build: (origin, key) =>
      JSON.stringify(
        {
          mcpServers: {
            mindstore: {
              url: `${origin}/api/mcp`,
              headers: {
                Authorization: `Bearer ${key}`,
              },
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    blurb: 'OpenAI\'s open-source coding agent. Reads MCP servers from ~/.codex/config.toml.',
    configPath: '~/.codex/config.toml',
    language: 'toml',
    build: (origin, key) =>
      `[mcp_servers.mindstore]\nurl = "${origin}/api/mcp"\nheaders = { Authorization = "Bearer ${key}" }`,
  },
  {
    id: 'cline',
    name: 'Cline (VS Code)',
    blurb: 'Open-source coding agent extension. Add MindStore through Cline\'s MCP Servers panel — paste this JSON.',
    configPath: 'Cline → MCP Servers → Edit settings JSON',
    language: 'json',
    build: (origin, key) =>
      JSON.stringify(
        {
          mcpServers: {
            mindstore: {
              url: `${origin}/api/mcp`,
              headers: {
                Authorization: `Bearer ${key}`,
              },
              alwaysAllow: ['search_mind', 'get_context', 'get_profile'],
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: 'continue',
    name: 'Continue (VS Code / JetBrains)',
    blurb: 'Open-source AI coding assistant. Configure via YAML.',
    configPath: '~/.continue/config.yaml',
    language: 'yaml',
    build: (origin, key) =>
      `mcpServers:\n  - name: mindstore\n    url: ${origin}/api/mcp\n    requestOptions:\n      headers:\n        Authorization: Bearer ${key}`,
  },
];

const TOOL_SUMMARY = [
  { name: 'search_mind', desc: 'Semantic search across your knowledge base.' },
  { name: 'get_context', desc: 'Pull the most relevant memories about a topic, formatted as context.' },
  { name: 'get_profile', desc: 'Stats: how many memories, top sources, date range.' },
  { name: 'get_timeline', desc: 'Trace a topic chronologically — when did your thinking start, how did it shift?' },
  { name: 'get_contradictions', desc: 'Surface contradictions in your knowledge so the AI presents both sides.' },
  { name: 'get_threads', desc: 'Find coherent threads (clustered memories from one source) on a topic.' },
  { name: 'learn_fact', desc: 'Let the AI write to your brain — "remember that X" stores a new memory.' },
];

export default function McpSetupPage() {
  usePageTitle('MCP Setup');

  // ─── Origin (the deployment URL) ──────────────────────────
  const [origin, setOrigin] = useState('https://mindstore.org');

  // ─── Existing keys ────────────────────────────────────────
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [keysError, setKeysError] = useState<string | null>(null);

  // ─── The "active" key being shown in the configs ──────────
  // Either: a freshly-minted raw key, a key the user pasted, or the placeholder.
  const [activeKey, setActiveKey] = useState<string>(PLACEHOLDER);
  const [keySource, setKeySource] = useState<'placeholder' | 'minted' | 'pasted'>('placeholder');
  const [showKey, setShowKey] = useState(false);

  // ─── Mint flow ────────────────────────────────────────────
  const [mintName, setMintName] = useState('My MCP client');
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);

  // ─── Paste flow ───────────────────────────────────────────
  const [pasted, setPasted] = useState('');

  // ─── Copy state per client ────────────────────────────────
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ─── Load keys + origin on mount ──────────────────────────
  const loadKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/api-keys');
      if (!res.ok) throw new Error(`Failed to load keys (${res.status})`);
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (err) {
      setKeysError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setKeysLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, [loadKeys]);

  async function handleMint() {
    setMinting(true);
    setMintError(null);
    try {
      const res = await fetch('/api/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: mintName.trim() || 'MCP client' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Mint failed (${res.status})`);
      }
      const data = await res.json();
      // The route returns { rawKey, apiKey } per src/server/api-keys.ts.
      const raw = data?.rawKey;
      if (typeof raw !== 'string') throw new Error('No raw key returned');
      setActiveKey(raw);
      setKeySource('minted');
      setShowKey(true);
      // Refresh the visible key list so the new one shows up by name.
      loadKeys();
    } catch (err) {
      setMintError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setMinting(false);
    }
  }

  function handleApplyPaste() {
    const trimmed = pasted.trim();
    if (!trimmed) return;
    setActiveKey(trimmed);
    setKeySource('pasted');
    setShowKey(true);
  }

  function handleResetKey() {
    setActiveKey(PLACEHOLDER);
    setKeySource('placeholder');
    setPasted('');
    setShowKey(false);
  }

  async function handleCopy(id: string, snippet: string) {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Fallback: select all + prompt
      window.prompt('Copy the snippet manually:', snippet);
    }
  }

  return (
    <PageTransition>
      <div className="space-y-8 md:space-y-10 max-w-4xl">
        {/* ─── Header ──────────────────────────── */}
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
              <Plug className="w-5 h-5 text-teal-400" />
            </div>
            <h1 className="text-[22px] md:text-[28px] font-semibold tracking-[-0.03em]">MCP Setup</h1>
          </div>
          <p className="text-[13px] text-zinc-500 mt-3">
            Plug your MindStore into any AI tool that speaks the Model Context Protocol — Claude
            Desktop, Claude Code, Cursor, Codex, Cline, Continue. Pick a client below, paste the
            generated config, and your AI assistant can search, contradict, thread, and write to
            your second brain.
          </p>
        </div>

        {/* ─── Tools you'll get ───────────────── */}
        <section className="p-5 md:p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-400" />
            <h2 className="text-base font-semibold text-white">7 tools your AI gets</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
            {TOOL_SUMMARY.map((tool) => (
              <div key={tool.name} className="flex items-start gap-2 text-[12.5px]">
                <code className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-teal-300 shrink-0 mt-px">
                  {tool.name}
                </code>
                <span className="text-zinc-400">{tool.desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Step 1: get a key ───────────────── */}
        <section className="p-5 md:p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <KeyRound className="w-4 h-4 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-white">Step 1 — choose a key</h2>
              <p className="text-[13px] text-zinc-500 mt-0.5">
                MCP requests carry an API key as a Bearer token. Mint a new one for this client
                (recommended — easier to revoke later) or paste one you already have.
              </p>
            </div>
          </div>

          {/* Mint */}
          <div className="space-y-2">
            <label className="text-xs text-zinc-500">Mint a new key</label>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={mintName}
                onChange={(e) => setMintName(e.target.value)}
                placeholder="Key name (e.g. 'Claude Desktop on laptop')"
                maxLength={64}
                disabled={minting}
                className="flex-1 min-w-[200px] px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white text-sm placeholder-zinc-600 focus:border-teal-500/40 focus:ring-1 focus:ring-teal-500/20 outline-none transition-all"
              />
              <button
                onClick={handleMint}
                disabled={minting || mintName.trim().length < 3}
                className="px-4 py-2 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 hover:bg-teal-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium inline-flex items-center gap-2"
              >
                {minting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Minting…
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Mint key
                  </>
                )}
              </button>
            </div>
            {mintError && (
              <div className="mt-1 p-2 rounded-lg bg-red-500/5 border border-red-500/20 flex items-center gap-2 text-xs text-red-400">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {mintError}
              </div>
            )}
          </div>

          {/* Paste */}
          <div className="space-y-2">
            <label className="text-xs text-zinc-500">Or paste an existing key</label>
            <div className="flex flex-wrap gap-2">
              <input
                type="password"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="msk_..."
                className="flex-1 min-w-[200px] px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white text-sm placeholder-zinc-600 font-mono focus:border-teal-500/40 focus:ring-1 focus:ring-teal-500/20 outline-none transition-all"
              />
              <button
                onClick={handleApplyPaste}
                disabled={!pasted.trim()}
                className="px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-zinc-200 hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                Use this key
              </button>
            </div>
          </div>

          {/* Existing keys */}
          {!keysLoading && keys.length > 0 && (
            <div className="text-xs text-zinc-500">
              You have <span className="text-zinc-300 font-medium">{keys.length}</span> existing key
              {keys.length === 1 ? '' : 's'}: {keys.slice(0, 3).map((k) => k.name).join(', ')}
              {keys.length > 3 ? `, +${keys.length - 3} more` : ''}.
              {' '}<a href="/app/connect" className="text-teal-400 hover:text-teal-300 underline-offset-2 hover:underline">Manage keys →</a>
            </div>
          )}
          {keysError && (
            <div className="text-xs text-red-400">Couldn&apos;t load existing keys: {keysError}</div>
          )}

          {/* Active key indicator */}
          <div className="pt-2 border-t border-white/[0.04]">
            <div className="text-xs text-zinc-500">Active key for the configs below:</div>
            <div className="mt-1 flex items-center gap-2">
              <code className="text-xs font-mono px-2 py-1 rounded bg-white/[0.04] border border-white/[0.06] text-zinc-300 overflow-x-auto whitespace-nowrap max-w-full">
                {keySource === 'placeholder'
                  ? PLACEHOLDER
                  : showKey
                    ? activeKey
                    : `${activeKey.slice(0, 8)}…${activeKey.slice(-4)}`}
              </code>
              {keySource !== 'placeholder' && (
                <>
                  <button
                    onClick={() => setShowKey((v) => !v)}
                    className="p-1.5 rounded-lg bg-white/[0.02] border border-white/[0.06] text-zinc-400 hover:text-zinc-200 transition-colors"
                    aria-label={showKey ? 'Hide key' : 'Show key'}
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={handleResetKey}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Reset
                  </button>
                </>
              )}
            </div>
            {keySource === 'minted' && (
              <p className="mt-2 text-xs text-amber-300/80">
                ⚠ Save this key now — you won&apos;t be able to view it again. After this page reloads only the truncated form is visible.
              </p>
            )}
            {keySource === 'placeholder' && (
              <p className="mt-2 text-xs text-zinc-500">
                Configs below currently show <code className="text-zinc-400">{PLACEHOLDER}</code>. Mint or paste a key to fill them in.
              </p>
            )}
          </div>
        </section>

        {/* ─── Step 2: pick your client ─────────── */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
              <Plug className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Step 2 — pick your client</h2>
              <p className="text-[13px] text-zinc-500 mt-0.5">
                Each card has a copy-paste config. Restart your client after applying.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {CLIENTS.map((client) => {
              const snippet = client.build(origin, activeKey);
              const isCopied = copiedId === client.id;
              return (
                <div key={client.id} className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
                  <div className="px-5 py-4 border-b border-white/[0.04] flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white">{client.name}</h3>
                      <p className="text-xs text-zinc-500 mt-0.5">{client.blurb}</p>
                      {client.configPath && (
                        <p className="text-[11px] text-zinc-600 mt-1.5 font-mono whitespace-pre-line">
                          {client.configPath}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleCopy(client.id, snippet)}
                      className="shrink-0 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-zinc-200 hover:bg-white/[0.06] transition-colors text-xs font-medium inline-flex items-center gap-1.5"
                      aria-label={`Copy ${client.name} config`}
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="px-5 py-4 text-xs text-zinc-300 font-mono overflow-x-auto whitespace-pre">
                    <span className="text-zinc-600 select-none">{client.language}</span>
                    {'\n'}
                    {snippet}
                  </pre>
                </div>
              );
            })}
          </div>
        </section>

        {/* ─── Step 3: try it ─────────────────────── */}
        <section className="p-5 md:p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-3">
          <h2 className="text-base font-semibold text-white">Step 3 — say hi to your second brain</h2>
          <p className="text-[13px] text-zinc-500">
            Restart your AI client after applying the config. Then try one of these prompts to confirm
            it&apos;s wired up:
          </p>
          <ul className="space-y-2 text-[13px] text-zinc-300">
            <li className="flex items-start gap-2">
              <span className="text-teal-400 shrink-0">→</span>
              <span><em>&quot;Use mindstore. What do I know about [a topic you&apos;ve saved]?&quot;</em></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-teal-400 shrink-0">→</span>
              <span><em>&quot;Show me the timeline of my notes on [topic] in the last 6 months.&quot;</em></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-teal-400 shrink-0">→</span>
              <span><em>&quot;Are there any contradictions in my knowledge base about [topic]?&quot;</em></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-teal-400 shrink-0">→</span>
              <span><em>&quot;Remember that [some fact]. Save it to my MindStore.&quot;</em></span>
            </li>
          </ul>
          <p className="text-xs text-zinc-500 pt-1">
            The AI will see the seven tools and pick the right one. If nothing happens, check that your client lists
            <code className="mx-1 px-1 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-teal-300">mindstore</code>
            under its connected MCP servers.
          </p>
        </section>
      </div>
    </PageTransition>
  );
}
