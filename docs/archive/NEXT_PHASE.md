> **ARCHIVED — 2026-05-03.** Superseded by `../../PRODUCTION_READINESS.md`. Branch references (`frain/improve`, `codex/local-dev`) and dates below are stale; preserved here for history.

---

# MindStore — Next Phase Plan

**Date:** March 26, 2026
**Status:** Branches converged. 0 diff between frain/improve and codex/local-dev.
**Build:** ✅ Passing | **Tests:** ✅ 336/336 | **Production:** ✅ Live at mindstore.org

---

## Reality Check

The product has 34 pages, 65 API routes, 35 plugins, 336 tests, 103 docs.
But production has **1 memory** and **0 AI providers configured**.

The codebase is massive. The product isn't being used yet.

**Priority shift: from building features → making what exists actually work beautifully.**

---

## Phase A: Production Hardening (on frain/improve)

### A1. Onboarding Flow (Critical)
New users land → confused → leave. Need:
- [ ] First-time wizard: "Welcome → Connect AI → Import first data → Done"
- [ ] Empty state designs for all pages (not blank white)
- [ ] "Try Demo" button that loads sample data without API key
- [ ] Settings page: guided AI provider setup with validation

### A2. Landing Page Overhaul
Current landing page is decent but doesn't convert. Need:
- [ ] Hero with clear value prop + CTA
- [ ] Live demo/screenshot section
- [ ] "Import your ChatGPT in 30 seconds" flow highlight
- [ ] Pricing section (Free tier clear, Pro teased)
- [ ] SEO: meta tags, OG images, structured data (partially done)

### A3. Critical Bug Fixes
- [ ] Google OAuth needs env vars (blocked on Irfan)
- [ ] GEMINI_API_KEY server default (blocked on Irfan)
- [ ] Test all plugin pages actually work end-to-end on production
- [ ] Error handling for missing AI provider (graceful, not crash)

### A4. Performance
- [ ] Bundle size audit
- [ ] Lazy load plugin pages
- [ ] Image optimization
- [ ] Core Web Vitals check

## Phase B: Polish & UX (on frain/improve)

### B1. Design Consistency Pass
- [ ] Audit all 34 pages for consistent design language
- [ ] Ensure all empty states have personality
- [ ] Loading states everywhere (skeleton screens, not spinners)
- [ ] Error states everywhere (friendly, not stack traces)

### B2. Mobile Experience
- [ ] Test all pages on mobile viewports
- [ ] Fix any overflow/layout issues
- [ ] Bottom nav improvements
- [ ] Touch targets audit

### B3. Accessibility
- [ ] ARIA labels audit (partially done)
- [ ] Keyboard navigation for all interactive elements
- [ ] Color contrast check
- [ ] Screen reader testing

## Phase C: Growth & Revenue Prep

### C1. Analytics
- [ ] Add Plausible/Umami (privacy-friendly)
- [ ] Track: signups, imports, searches, plugin activations

### C2. .mind File Implementation
- [ ] Phase 1: Export from MindStore → .mind file
- [ ] Phase 2: Import .mind files
- [ ] Phase 3: Share .mind files (web viewer)

### C3. Revenue Foundations
- [ ] Pro tier definition
- [ ] Dodo Payments integration prep
- [ ] Usage limits for free tier

---

## Cron Strategy

### mindstore-improve (every 30 min)
Focus: Work through Phase A → B → C systematically.
Each cycle: pick the next unchecked item, implement it, commit, report.

### daily-update (9 PM IST)
Summary of everything completed that day.

---

## Branch Strategy
- All work on `frain/improve`
- Keep codex/local-dev in sync (push same commits to both)
- Never merge to main without Irfan's approval
