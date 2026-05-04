"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Brain, LayoutDashboard, Upload, MessageSquare, Compass, Settings,
  GraduationCap, Fingerprint, Lightbulb, Network, Menu, X, MoreHorizontal,
  Search, Keyboard, Puzzle, TrendingUp, Heart, Target, PenTool, Layers,
  FileEdit, Users, Route, FileUser, Mail, Mic, Camera, SlidersHorizontal, Globe, Dna,
  Download, FolderDown, FileStack, Gem, ChevronDown, Zap, BarChart3, Copy, FolderOpen,
  FileBox, Plug,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MindStoreLogo } from "@/components/MindStoreLogo";
import { useAiStatus } from "@/lib/use-ai-status";
import { hasUnseenChangelog } from "@/components/WhatsNew";

// Version display — bump when releasing
const APP_VERSION = "0.3";

// ─── Lazy load overlays & drawers (triggered by user action, not immediately visible) ───
const Onboarding = dynamic(() => import("@/components/Onboarding").then(m => ({ default: m.Onboarding })), { ssr: false });
const CommandPalette = dynamic(() => import("@/components/CommandPalette").then(m => ({ default: m.CommandPalette })), { ssr: false });
const GlobalDropZone = dynamic(() => import("@/components/GlobalDropZone").then(m => ({ default: m.GlobalDropZone })), { ssr: false });
const KeyboardShortcuts = dynamic(() => import("@/components/KeyboardShortcuts").then(m => ({ default: m.KeyboardShortcuts })), { ssr: false });
const QuickCapture = dynamic(() => import("@/components/QuickCapture").then(m => ({ default: m.QuickCapture })), { ssr: false });
const MemoryDrawer = dynamic(() => import("@/components/MemoryDrawer").then(m => ({ default: m.MemoryDrawer })), { ssr: false });
const NotificationCenter = dynamic(() => import("@/components/NotificationCenter").then(m => ({ default: m.NotificationCenter })), { ssr: false });
const WhatsNew = dynamic(() => import("@/components/WhatsNew").then(m => ({ default: m.WhatsNew })), { ssr: false });

interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
}

interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
  collapsible?: boolean;
}

const navSections: NavSection[] = [
  {
    id: "core",
    label: "",
    collapsible: false,
    items: [
      { href: "/app", icon: LayoutDashboard, label: "Home" },
      { href: "/app/chat", icon: MessageSquare, label: "Chat" },
      { href: "/app/import", icon: Upload, label: "Import" },
      { href: "/app/explore", icon: Compass, label: "Explore" },
    ],
  },
  {
    id: "knowledge",
    label: "Knowledge",
    collapsible: true,
    items: [
      { href: "/app/learn", icon: GraduationCap, label: "Learn" },
      { href: "/app/collections", icon: FolderOpen, label: "Collections" },
      { href: "/app/mindmap", icon: Network, label: "Mind Map" },
      { href: "/app/fingerprint", icon: Fingerprint, label: "Fingerprint" },
      { href: "/app/stats", icon: BarChart3, label: "Stats" },
      { href: "/app/insights", icon: Lightbulb, label: "Insights" },
    ],
  },
  {
    id: "analysis",
    label: "Analysis",
    collapsible: true,
    items: [
      { href: "/app/evolution", icon: TrendingUp, label: "Evolution" },
      { href: "/app/sentiment", icon: Heart, label: "Sentiment" },
      { href: "/app/gaps", icon: Target, label: "Gaps" },
      { href: "/app/duplicates", icon: Copy, label: "Duplicates" },
      { href: "/app/writing", icon: PenTool, label: "Writing Style" },
    ],
  },
  {
    id: "create",
    label: "Create",
    collapsible: true,
    items: [
      { href: "/app/flashcards", icon: Layers, label: "Flashcards" },
      { href: "/app/blog", icon: FileEdit, label: "Blog Writer" },
      { href: "/app/prep", icon: Users, label: "Prep" },
      { href: "/app/paths", icon: Route, label: "Learn Paths" },
      { href: "/app/resume", icon: FileUser, label: "Resume" },
      { href: "/app/newsletter", icon: Mail, label: "Newsletter" },
    ],
  },
  {
    id: "ai",
    label: "AI Tools",
    collapsible: true,
    items: [
      { href: "/app/voice", icon: Mic, label: "Voice" },
      { href: "/app/vision", icon: Camera, label: "Vision" },
      { href: "/app/retrieval", icon: SlidersHorizontal, label: "Retrieval" },
      { href: "/app/languages", icon: Globe, label: "Languages" },
      { href: "/app/domains", icon: Dna, label: "Domains" },
    ],
  },
  {
    id: "sync",
    label: "Sync & Export",
    collapsible: true,
    items: [
      { href: "/app/anki", icon: Download, label: "Anki Export" },
      { href: "/app/export", icon: FolderDown, label: "Blog Export" },
      { href: "/app/portable", icon: FileBox, label: "Portable .mind" },
      { href: "/app/notion-sync", icon: FileStack, label: "Notion Sync" },
      { href: "/app/obsidian-sync", icon: Gem, label: "Obsidian Sync" },
    ],
  },
  {
    id: "system",
    label: "",
    collapsible: false,
    items: [
      { href: "/app/plugins", icon: Puzzle, label: "Plugins" },
      { href: "/app/connect", icon: Network, label: "Connect AI" },
      { href: "/app/mcp-setup", icon: Plug, label: "MCP Setup" },
      { href: "/app/settings", icon: Settings, label: "Settings" },
    ],
  },
];

// Flat list for mobile menu
const allNavItems = navSections.flatMap((s) => s.items);

const bottomNav = [
  { href: "/app", icon: LayoutDashboard, label: "Home" },
  { href: "/app/chat", icon: MessageSquare, label: "Chat" },
  { href: "/app/import", icon: Upload, label: "Import" },
  { href: "/app/explore", icon: Compass, label: "Explore" },
];

// Pages where the AI banner should NOT show
const NO_AI_BANNER_PATHS = new Set(["/app/settings", "/app/connect", "/app/import"]);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const aiStatus = useAiStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showNewDot, setShowNewDot] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const [scrollState, setScrollState] = useState<"top" | "middle" | "bottom" | "none">("none");
  // Track which sidebar sections are collapsed (by section id)
  // Default: secondary sections collapsed to reduce visual overload
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("ms:nav-collapsed");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return { analysis: true, create: true, ai: true, sync: true };
  });

  const showAiBanner = aiStatus.loaded && !aiStatus.hasAi && !NO_AI_BANNER_PATHS.has(pathname);

  // Auto-expand section containing current page
  useEffect(() => {
    setMenuOpen(false);
    // If current path is in a collapsed section, expand it
    for (const section of navSections) {
      if (section.collapsible && section.items.some((i) => i.href === pathname)) {
        setCollapsed((prev) => ({ ...prev, [section.id]: false }));
      }
    }
  }, [pathname]);

  // Check for unseen changelog (client-side only, avoids hydration mismatch)
  useEffect(() => {
    setShowNewDot(hasUnseenChangelog());
    function onWhatsNewOpened() { setShowNewDot(false); }
    window.addEventListener("mindstore:open-whats-new", onWhatsNewOpened);
    return () => window.removeEventListener("mindstore:open-whats-new", onWhatsNewOpened);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  const toggleSection = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem("ms:nav-collapsed", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Track sidebar scroll position for fade indicators
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    function update() {
      if (!el) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      const atTop = scrollTop < 4;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 4;
      if (scrollHeight <= clientHeight) setScrollState("none");
      else if (atTop) setScrollState("top");
      else if (atBottom) setScrollState("bottom");
      else setScrollState("middle");
    }
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, [collapsed]);

  const isChat = pathname === "/app/chat";

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0b]">
      {/* ════════ SKIP TO CONTENT (Accessibility) ════════ */}
      <a href="#main-content" className="skip-to-content">
        Skip to content
      </a>
      {/* ════════ ONBOARDING ════════ */}
      <Onboarding />
      {/* ════════ COMMAND PALETTE ════════ */}
      <CommandPalette />
      {/* ════════ GLOBAL DROP ZONE ════════ */}
      <GlobalDropZone />
      {/* ════════ KEYBOARD SHORTCUTS HELP ════════ */}
      <KeyboardShortcuts />
      {/* ════════ WHAT'S NEW ════════ */}
      <WhatsNew />
      {/* ════════ QUICK CAPTURE ════════ */}
      <QuickCapture />
      {/* ════════ MEMORY DETAIL DRAWER ════════ */}
      <MemoryDrawer />
      {/* ════════ MOBILE HEADER ════════ */}
      <header className={cn(
        "md:hidden fixed top-0 inset-x-0 z-50 safe-top",
        "h-12 flex items-center justify-between px-4",
        "bg-[#0a0a0b]/80 backdrop-blur-2xl backdrop-saturate-150",
        "border-b border-white/[0.04]",
      )}>
        <Link href="/app" className="flex items-center gap-2">
          <MindStoreLogo className="w-7 h-7" />
          <span className="font-semibold text-[15px] tracking-[-0.01em]">MindStore</span>
        </Link>
        <div className="flex items-center gap-1">
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/[0.06] active:bg-white/[0.1] transition-colors"
            aria-label="Search"
          >
            <Search className="w-[18px] h-[18px] text-zinc-400" />
          </button>
          <NotificationCenter />
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/[0.06] active:bg-white/[0.1] transition-colors"
            aria-label="Menu"
          >
            {menuOpen ? <X className="w-[18px] h-[18px]" /> : <Menu className="w-[18px] h-[18px]" />}
          </button>
        </div>
      </header>

      {/* ════════ MOBILE MENU OVERLAY ════════ */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
          <div
            className="absolute top-12 inset-x-0 safe-top bg-[#111113] border-b border-white/[0.06] animate-in slide-in-from-top shadow-2xl shadow-black/50"
            onClick={(e) => e.stopPropagation()}
          >
            <nav className="p-2 max-h-[70dvh] overflow-y-auto">
              {navSections.map((section) => (
                <div key={section.id}>
                  {section.label && (
                    <button
                      onClick={() => section.collapsible && toggleSection(section.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider",
                        section.collapsible ? "text-zinc-500 hover:text-zinc-300 cursor-pointer" : "text-zinc-600 cursor-default",
                      )}
                    >
                      <span>{section.label}</span>
                      {section.collapsible && (
                        <ChevronDown className={cn(
                          "w-3 h-3 transition-transform duration-200",
                          collapsed[section.id] && "-rotate-90"
                        )} />
                      )}
                    </button>
                  )}
                  {!collapsed[section.id] && section.items.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] transition-all active:scale-[0.98]",
                          active
                            ? "bg-teal-500/12 text-white font-medium"
                            : "text-zinc-400 active:bg-white/[0.06]"
                        )}
                      >
                        <item.icon className={cn("w-5 h-5", active ? "text-teal-400" : "text-zinc-500")} />
                        {item.label}
                        {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-teal-400" />}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* ════════ DESKTOP SIDEBAR ════════ */}
      <aside className="hidden md:flex w-[220px] fixed left-0 top-0 h-screen flex-col z-30 bg-[#0a0a0b] border-r border-white/[0.04]" aria-label="Main navigation">
        <div className="h-14 flex items-center justify-between px-5 border-b border-white/[0.04]">
          <Link href="/" className="flex items-center gap-2.5">
            <MindStoreLogo className="w-7 h-7" />
            <span className="font-semibold text-[15px] tracking-[-0.01em]">MindStore</span>
          </Link>
          <NotificationCenter />
        </div>
        <div className="relative flex-1 min-h-0">
          {/* Scroll fade — top */}
          {(scrollState === "middle" || scrollState === "bottom") && (
            <div className="absolute top-0 inset-x-0 h-6 bg-gradient-to-b from-[#0a0a0b] to-transparent z-10 pointer-events-none" />
          )}
          <nav ref={navRef} className="h-full py-2 px-2.5 space-y-0.5 overflow-y-auto sidebar-scroll">
          {navSections.map((section) => (
            <div key={section.id}>
              {section.label && (
                <button
                  onClick={() => section.collapsible && toggleSection(section.id)}
                  className={cn(
                    "w-full flex items-center gap-1.5 px-2.5 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest select-none",
                    section.collapsible ? "text-zinc-500 hover:text-zinc-400 cursor-pointer transition-colors" : "text-zinc-600 cursor-default",
                  )}
                >
                  <span>{section.label}</span>
                  {section.collapsible && (
                    <ChevronDown className={cn(
                      "w-3 h-3 transition-transform duration-200 ml-auto",
                      collapsed[section.id] && "-rotate-90"
                    )} />
                  )}
                </button>
              )}
              <div className={cn(
                "overflow-hidden transition-all duration-200",
                collapsed[section.id] ? "max-h-0 opacity-0" : "max-h-[500px] opacity-100"
              )}>
                {section.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-all relative",
                        active
                          ? "bg-white/[0.08] text-white"
                          : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
                      )}
                    >
                      {active && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-teal-400" />
                      )}
                      <item.icon className={cn("w-4 h-4", active ? "text-teal-400" : "text-zinc-500")} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
              {!section.label && section.id === "core" && (
                <div className="mx-2.5 my-2 border-b border-white/[0.04]" />
              )}
              {section.id === "sync" && (
                <div className="mx-2.5 my-2 border-b border-white/[0.04]" />
              )}
            </div>
          ))}
        </nav>
          {/* Scroll fade — bottom */}
          {(scrollState === "middle" || scrollState === "top") && (
            <div className="absolute bottom-0 inset-x-0 h-6 bg-gradient-to-t from-[#0a0a0b] to-transparent z-10 pointer-events-none" />
          )}
        </div>
        <div className="px-4 py-3 border-t border-white/[0.04] space-y-2">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("mindstore:quick-capture"))}
            className="w-full flex items-center gap-2 px-2.5 py-[7px] rounded-lg text-[12px] text-teal-500/80 hover:text-teal-400 hover:bg-teal-500/[0.06] transition-all"
          >
            <Zap className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">Quick Capture</span>
            <kbd className="text-[10px] font-mono bg-white/[0.04] border border-white/[0.08] rounded px-1.5 py-[1px] text-zinc-600">⌘⇧N</kbd>
          </button>
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            className="w-full flex items-center gap-2 px-2.5 py-[7px] rounded-lg text-[12px] text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.04] transition-all"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">Search</span>
            <kbd className="text-[10px] font-mono bg-white/[0.04] border border-white/[0.08] rounded px-1.5 py-[1px]">⌘K</kbd>
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("mindstore:open-shortcuts"))}
            className="w-full flex items-center gap-2 px-2.5 py-[7px] rounded-lg text-[12px] text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.04] transition-all"
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">Shortcuts</span>
            <kbd className="text-[10px] font-mono bg-white/[0.04] border border-white/[0.08] rounded px-1.5 py-[1px]">?</kbd>
          </button>
          <button
            onClick={() => window.dispatchEvent(new Event("mindstore:open-whats-new"))}
            className="w-full flex items-center gap-1.5 text-[10px] text-zinc-600 hover:text-zinc-400 font-medium tracking-wide px-2.5 py-1 rounded-lg hover:bg-white/[0.04] transition-all text-left relative"
          >
            MINDSTORE v{APP_VERSION}
            {showNewDot && (
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
            )}
          </button>
        </div>
      </aside>

      {/* ════════ MAIN CONTENT ════════ */}
      <main
        id="main-content"
        className={cn(
        "md:ml-[220px] min-h-[100dvh]",
        "pt-12 md:pt-0",  // account for mobile header
        "pb-[52px] md:pb-0",  // bottom nav space on mobile (always visible now)
      )}>
        <div className={cn(
          "mx-auto",
          isChat ? "h-[calc(100dvh-3rem-52px)] md:h-[100dvh]" : "max-w-3xl px-4 py-6 md:px-8 md:py-8",
        )}>
          <ErrorBoundary>
            {showAiBanner && (
              <div className="mb-4">
                <Link href="/app/settings">
                  <div className="flex items-center justify-between rounded-2xl bg-amber-500/[0.06] border border-amber-500/15 px-4 py-3 hover:bg-amber-500/[0.1] transition-all group">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                        <Settings className="w-4 h-4 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-[13px] text-amber-300 font-medium">Connect an AI provider to unlock all features</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">Search, chat, insights, and 35+ plugins need Gemini (free), OpenAI, or Ollama</p>
                      </div>
                    </div>
                    <span className="text-[12px] text-amber-400 font-medium shrink-0 group-hover:translate-x-0.5 transition-transform">Set up →</span>
                  </div>
                </Link>
              </div>
            )}
            {children}
          </ErrorBoundary>
        </div>
      </main>

      {/* ════════ MOBILE FAB — Quick Capture ════════ */}
      {!isChat && (
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("mindstore:quick-capture"))}
          className={cn(
            "md:hidden fixed z-50",
            "right-4 bottom-[68px]",
            "w-12 h-12 rounded-2xl",
            "bg-teal-500 shadow-lg shadow-teal-500/25",
            "flex items-center justify-center",
            "active:scale-90 transition-transform",
          )}
          aria-label="Quick Capture"
        >
          <Zap className="w-5 h-5 text-white" />
        </button>
      )}

      {/* ════════ MOBILE BOTTOM NAV ════════ */}
      <nav className={cn(
        "md:hidden fixed bottom-0 inset-x-0 z-50 safe-bottom",
        "bg-[#0a0a0b]/80 backdrop-blur-2xl backdrop-saturate-150",
        "border-t border-white/[0.04]",
      )}>
          <div className="grid grid-cols-5 h-[52px]">
            {bottomNav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center justify-center gap-[2px] active:opacity-70 transition-opacity"
                >
                  <item.icon className={cn(
                    "w-[20px] h-[20px] transition-colors",
                    active ? "text-teal-400" : "text-zinc-600"
                  )} />
                  <span className={cn(
                    "text-[10px] font-medium transition-colors",
                    active ? "text-teal-400" : "text-zinc-600"
                  )}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
            <button
              onClick={() => setMenuOpen(true)}
              className="flex flex-col items-center justify-center gap-[2px] active:opacity-70 transition-opacity"
            >
              <MoreHorizontal className="w-[20px] h-[20px] text-zinc-600" />
              <span className="text-[10px] font-medium text-zinc-600">More</span>
            </button>
          </div>
        </nav>
    </div>
  );
}
