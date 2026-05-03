> **ARCHIVED — 2026-05-03.** Superseded by `../../STATUS.md` §9 + `../../PRODUCTION_READINESS.md`. Preserved here for history.

---

# MindStore — What's Next (Production Focus)

**Date:** March 26, 2026
**Branch:** frain/improve → deploy to main → mindstore.org

---

## Current Product State

### ✅ What Works (Production)
- **35 pages** across dashboard, import, chat, explore, analysis, creation, AI tools, sync/export, settings
- **35+ API routes** — full backend coverage
- **36 plugin port modules** — all portable server-side logic
- **Landing page** — hero, features, how-it-works, plugins showcase
- **Dashboard** — stats, widgets, recent memories, pinned, daily activity
- **Import** — ChatGPT, JSON, ZIP, text, URL, Kindle, PDF, YouTube, Reddit, Obsidian, Notion, bookmarks + 8 more
- **Chat** — multi-provider AI (OpenAI, Gemini, Ollama, OpenRouter, Custom)
- **Explore** — search, filter, view modes, memory detail drawer
- **Analysis** — evolution, sentiment, gaps, duplicates, writing style, contradiction finder
- **Creation** — flashcards, blog writer, prep, learning paths, resume, newsletter
- **AI Tools** — voice transcription, vision, retrieval, languages, domains
- **Sync/Export** — Anki, blog export, Notion sync, Obsidian sync
- **System** — plugin store, settings, onboarding, notifications, command palette, keyboard shortcuts
- **Infrastructure** — 336 tests, CI/CD, DCO, licensing, 103 doc files, MCP server, browser extension support

### 🔴 What's Broken/Missing for REAL Users
1. **No AI provider configured on production** — Gemini/OpenAI keys not set. Chat, analysis, flashcards, ALL AI features are dead for new users.
2. **No Google OAuth** — single-user mode only. No signup/login.
3. **Only 1 memory in production** — Irfan's test. App looks empty for new visitors.
4. **Demo mode needs polish** — exists but may not showcase the product well enough
5. **Landing page sells ChatGPT import too hard** — MindStore is SO much more
6. **No onboarding flow after signup** — user lands on empty dashboard
7. **Mobile experience unknown** — not tested on real devices
8. **No SEO/OG images** — landing page renders client-side, bots see nothing

---

## Priority Order (What Matters for Users)

### P0 — Make It Actually Usable (This Session)
1. **Landing page rewrite** — sell the FULL product, not just ChatGPT import
   - Show all import sources (12+), analysis tools, AI chat, knowledge graph
   - Real screenshots/mockups of each major feature
   - Better value proposition: "Your AI-powered second brain"
2. **Demo mode polish** — pre-loaded demo data that showcases EVERY feature
   - Rich sample data across multiple sources
   - Demo flashcards, mind map, sentiment data, collections
   - Make "Try Demo" actually impressive
3. **Empty states for every page** — when user has no data, show helpful guidance
4. **Onboarding flow** — guide new users: connect AI → import first data → explore

### P1 — Production Readiness
5. **Server-side default AI** — Gemini API key as env var so features work out of box
6. **Google OAuth** — multi-user login
7. **OG image + proper meta tags** — so sharing links looks good
8. **Mobile responsive audit** — every page

### P2 — Polish
9. **Page transitions + loading states** — make it feel premium
10. **Error handling** — graceful failures everywhere
11. **Performance** — lazy loading, code splitting

---

## Work Plan (frain/improve branch)

### Session 1: Landing Page Rewrite (NOW)
- Use Impeccable frontend-design skill
- Redesign hero to sell the full vision
- Feature sections for: Import (all sources), Chat AI, Knowledge Graph, Analysis Suite, Plugin System
- Social proof / open source badge
- Responsive, OLED-black, teal/sky palette

### Session 2: Demo Mode Enhancement
- Create rich demo dataset covering all features
- Pre-populate: memories from multiple sources, flashcard decks, sentiment data, collections, tags
- Make every page look alive in demo mode

### Session 3: Empty States + Onboarding
- Design empty states for every major page
- Build onboarding wizard: welcome → connect AI → import data → explore

### Session 4: Production Config (needs Irfan)
- Set GEMINI_API_KEY on Vercel
- Set Google OAuth credentials
- Run DB migrations
