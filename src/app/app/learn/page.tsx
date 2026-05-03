"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Brain, User, Loader2, Sparkles, CheckCircle2, RotateCcw,
  ArrowUp, GraduationCap, ChevronsDown,
} from "lucide-react";
import { checkApiKey, streamChat } from "@/lib/openai";
import { ChatMarkdown } from "@/components/ChatMarkdown";
import { EmptyFeatureState } from "@/components/EmptyFeatureState";
import { toast } from "sonner";
import { usePageTitle } from "@/lib/use-page-title";

interface Message {
  role: "user" | "assistant";
  content: string;
  factsLearned?: string[];
}

interface LearnedFact {
  key: string;
  value: string;
  category: string;
}

const INTERVIEW_TOPICS = [
  { id: "intro", label: "Who you are", icon: "👤", prompt: "Start by getting to know the basics: their name, what they do, where they live, their background." },
  { id: "work", label: "Work & projects", icon: "💼", prompt: "Ask about their current work, projects, professional goals, skills, and career journey." },
  { id: "interests", label: "Interests & passions", icon: "🎯", prompt: "Explore their hobbies, interests, things they're curious about, what they read or watch." },
  { id: "thinking", label: "How you think", icon: "🧠", prompt: "Understand their decision-making style, values, what motivates them, pet peeves, strong opinions." },
  { id: "goals", label: "Goals & dreams", icon: "🚀", prompt: "Ask about short-term and long-term goals, dreams, what success looks like to them." },
  { id: "relationships", label: "People & connections", icon: "👥", prompt: "Learn about important people in their life, communities they're part of, how they collaborate." },
  { id: "freeform", label: "Tell me anything", icon: "✨", prompt: "Open-ended conversation. Let the user share whatever they want you to know about them." },
];

const SYSTEM_PROMPT = `You are MindStore's AI interviewer. Your job is to learn about this person through natural conversation. You're warm, curious, and genuinely interested.

RULES:
1. Ask ONE question at a time. Never multiple questions.
2. React to their answers naturally before asking the next question. Show you're listening.
3. Go deeper on interesting things they mention. Follow the thread.
4. After each of their response, internally extract key facts (you'll be asked to list them).
5. Keep it conversational, not interrogative. Like a great first date, not a job interview.
6. After 3-4 exchanges on a subtopic, you can gently pivot to explore something new.
7. If they give a short answer, ask a follow-up. If they give a long one, acknowledge the depth.

CURRENT TOPIC FOCUS: {topic}

At the end of each response, on a new line, output extracted facts in this exact format:
[FACTS]
key: value | category
[/FACTS]

Categories: preference, trait, goal, knowledge, relationship, habit, background, opinion
Example:
[FACTS]
favorite_language: TypeScript | preference  
works_at: AltCorp | background
morning_person: yes, wakes at 6am | habit
[/FACTS]

If no new facts were revealed, omit the FACTS block entirely.`;

function parseFacts(content: string): { cleanContent: string; facts: LearnedFact[] } {
  const factsMatch = content.match(/\[FACTS\]([\s\S]*?)\[\/FACTS\]/);
  const cleanContent = content.replace(/\[FACTS\][\s\S]*?\[\/FACTS\]/, "").trim();
  
  if (!factsMatch) return { cleanContent, facts: [] };
  
  const facts: LearnedFact[] = [];
  const lines = factsMatch[1].trim().split("\n");
  for (const line of lines) {
    const match = line.match(/^(.+?):\s*(.+?)\s*\|\s*(.+)$/);
    if (match) {
      facts.push({ key: match[1].trim(), value: match[2].trim(), category: match[3].trim() });
    }
  }
  return { cleanContent, facts };
}

const CATEGORY_COLORS: Record<string, string> = {
  preference: "text-teal-400 bg-teal-500/10 border-teal-500/15",
  trait: "text-blue-400 bg-blue-500/10 border-blue-500/15",
  goal: "text-emerald-400 bg-emerald-500/10 border-emerald-500/15",
  knowledge: "text-cyan-400 bg-cyan-500/10 border-cyan-500/15",
  relationship: "text-red-400 bg-red-500/10 border-red-500/15",
  habit: "text-amber-400 bg-amber-500/10 border-amber-500/15",
  background: "text-orange-400 bg-orange-500/10 border-orange-500/15",
  opinion: "text-red-400 bg-red-500/10 border-red-500/15",
};

export default function LearnPage() {
  usePageTitle("Learn");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [allFacts, setAllFacts] = useState<LearnedFact[]>([]);
  const [factsSaved, setFactsSaved] = useState(0);
  const [hasApiKey, setHasApiKey] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const isNearBottomRef = useRef(true);

  useEffect(() => {
    if (scrollRef.current && isNearBottomRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  // Detect scroll position for "scroll to bottom" button
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onScroll() {
      if (!el) return;
      const threshold = 120;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      isNearBottomRef.current = nearBottom;
      setShowScrollBtn(!nearBottom && messages.length > 0);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [messages.length]);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  useEffect(() => {
    checkApiKey().then((data) => setHasApiKey(data.hasApiKey));
    fetch('/api/v1/memories?source=text&search=Learned%3A&limit=1')
      .then(r => r.json())
      .then(data => setFactsSaved(data.total || 0))
      .catch(() => {});
  }, []);

  const saveFact = useCallback(async (fact: LearnedFact) => {
    try {
      const content = `${fact.key}: ${fact.value}`;
      await fetch('/api/v1/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          sourceType: 'text',
          sourceId: `interview-${fact.category}`,
          sourceTitle: `Learned: ${fact.key}`,
          metadata: { category: fact.category, type: 'learned-fact', key: fact.key, value: fact.value },
        }),
      });
      setFactsSaved(prev => prev + 1);
    } catch (e) {
      console.error("Failed to save fact:", e);
    }
  }, []);

  async function startInterview(topicId: string) {
    setSelectedTopic(topicId);
    setMessages([]);
    setAllFacts([]);
    setLoading(true);

    const topic = INTERVIEW_TOPICS.find(t => t.id === topicId)!;
    const systemMsg = SYSTEM_PROMPT.replace("{topic}", topic.prompt);

    try {
      let response = "";
      const assistantMsg: Message = { role: "assistant", content: "" };
      setMessages([assistantMsg]);

      if (!hasApiKey) throw new Error("No API key set");
      const stream = streamChat(
        [{ role: "system", content: systemMsg }, { role: "user", content: `Start the conversation about: ${topic.label}. Ask your first question.` }]
      );
      for await (const chunk of stream) {
        response += chunk;
        const { cleanContent } = parseFacts(response);
        setMessages([{ ...assistantMsg, content: cleanContent }]);
      }

      const { cleanContent } = parseFacts(response);
      setMessages([{ role: "assistant", content: cleanContent }]);
    } catch (err) {
      setMessages([{ role: "assistant", content: `Error starting interview: ${err instanceof Error ? err.message : "Unknown error"}` }]);
    }
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function handleSend() {
    const q = input.trim();
    if (!q || loading || !selectedTopic) return;

    setInput("");
    const userMsg: Message = { role: "user", content: q };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    const topic = INTERVIEW_TOPICS.find(t => t.id === selectedTopic)!;
    const systemMsg = SYSTEM_PROMPT.replace("{topic}", topic.prompt);
    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

    try {
      let response = "";
      const assistantMsg: Message = { role: "assistant", content: "" };
      setMessages(prev => [...prev, assistantMsg]);

      if (!hasApiKey) throw new Error("No API key set");
      const stream = streamChat(
        [{ role: "system", content: systemMsg }, ...history]
      );
      for await (const chunk of stream) {
        response += chunk;
        const { cleanContent } = parseFacts(response);
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...assistantMsg, content: cleanContent };
          return updated;
        });
      }

      const { cleanContent, facts } = parseFacts(response);
      
      for (const fact of facts) {
        await saveFact(fact);
      }
      setAllFacts(prev => [...prev, ...facts]);

      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: cleanContent,
          factsLearned: facts.map(f => `${f.key}: ${f.value}`),
        };
        return updated;
      });
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "Something went wrong"}` },
      ]);
    }
    setLoading(false);
  }

  // ═══════════════════════════════════════════
  // TOPIC SELECTION SCREEN
  // ═══════════════════════════════════════════
  if (!selectedTopic) {
    // Data-zero state: no AI provider configured and nothing learned yet
    if (!hasApiKey && factsSaved === 0) {
      return (
        <div className="space-y-6 md:space-y-8">
          <div className="space-y-1">
            <h1 className="text-[22px] md:text-[28px] font-semibold tracking-[-0.03em]">Learn About You</h1>
            <p className="text-[13px] text-zinc-500">
              Have a conversation so MindStore can learn who you are
            </p>
          </div>
          <EmptyFeatureState
            icon={GraduationCap}
            title="Learn is ready when an AI provider is connected"
            description="Connect a free Gemini key (or OpenAI / Ollama) in Settings so MindStore can interview you and capture facts about who you are."
            ctaText="Connect AI provider →"
            ctaHref="/app/settings"
            secondaryText="Get a free Gemini key at aistudio.google.com/apikey"
          />
        </div>
      );
    }

    return (
      <div className="space-y-6 md:space-y-8">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-[22px] md:text-[28px] font-semibold tracking-[-0.03em]">Learn About You</h1>
          <p className="text-[13px] text-zinc-500">
            Have a conversation so MindStore can learn who you are
            {factsSaved > 0 && <> · <span className="text-teal-400 font-medium">{factsSaved} facts learned</span></>}
          </p>
        </div>

        {/* No API key warning */}
        {!hasApiKey && (
          <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-500/[0.06] to-orange-500/[0.06] border border-amber-500/15 px-4 py-3">
            <span className="text-[13px]">⚠️</span>
            <p className="text-[12px] text-amber-300 font-medium">
              Connect an AI provider in{" "}
              <a href="/app/settings" className="text-amber-400 underline underline-offset-2 hover:text-white transition-colors">Settings</a>
              {" "}first — Gemini is free
            </p>
          </div>
        )}

        {/* Hero */}
        <div className="text-center py-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500/20 to-sky-500/20 flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-6 h-6 text-teal-400" />
          </div>
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] mb-1.5">What should we talk about?</h2>
          <p className="text-[13px] text-zinc-500">Pick a topic — the AI will interview you naturally</p>
        </div>

        {/* Topic Grid */}
        <div className="grid grid-cols-2 gap-2.5 md:gap-3">
          {INTERVIEW_TOPICS.map((topic) => (
            <button
              key={topic.id}
              onClick={() => hasApiKey && startInterview(topic.id)}
              disabled={!hasApiKey}
              className="group p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-teal-500/20 transition-all text-left active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="text-[22px] leading-none block mb-2.5">{topic.icon}</span>
              <p className="text-[13px] font-medium group-hover:text-teal-300 transition-colors">{topic.label}</p>
            </button>
          ))}
        </div>

        {/* Facts summary if any */}
        {factsSaved > 0 && (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
              <p className="text-[12px] text-zinc-300 font-medium">MindStore knows {factsSaved} things about you</p>
            </div>
            <p className="text-[11px] text-zinc-600">Start another topic to teach it more</p>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // INTERVIEW CHAT SCREEN
  // ═══════════════════════════════════════════
  const currentTopic = INTERVIEW_TOPICS.find(t => t.id === selectedTopic);

  return (
    <div className="flex flex-col h-full">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[16px] leading-none">{currentTopic?.icon}</span>
          <div className="min-w-0">
            <p className="text-[13px] font-medium truncate">{currentTopic?.label}</p>
            <p className="text-[10px] text-zinc-600">
              {allFacts.length > 0 ? (
                <span className="text-green-400">{allFacts.length} fact{allFacts.length !== 1 ? "s" : ""} learned</span>
              ) : (
                "Interview in progress"
              )}
            </p>
          </div>
        </div>
        <button
          onClick={() => setSelectedTopic(null)}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all active:scale-[0.96]"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          New topic
        </button>
      </div>

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : ""}`}>
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-teal-500/20 to-sky-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Brain className="w-3.5 h-3.5 text-teal-400" />
                </div>
              )}
              <div className={`max-w-[82%] space-y-2`}>
                <div className={`${
                  msg.role === "user"
                    ? "rounded-[20px] rounded-br-md bg-teal-600 text-white px-4 py-2.5"
                    : "rounded-[20px] rounded-bl-md bg-white/[0.04] border border-white/[0.06] px-4 py-2.5"
                }`}>
                  <div className="text-[13px] leading-[1.6]">
                    {msg.content ? (
                      <ChatMarkdown content={msg.content} />
                    ) : loading && i === messages.length - 1 ? (
                      <span className="flex items-center gap-2 text-zinc-500">
                        <span className="flex gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                        </span>
                      </span>
                    ) : ""}
                  </div>
                </div>
                {/* Learned facts badges */}
                {msg.factsLearned && msg.factsLearned.length > 0 && (
                  <div className="flex flex-wrap gap-1 px-1">
                    {msg.factsLearned.map((fact, j) => {
                      // Try to find the category for color coding
                      const matchingFact = allFacts.find(f => `${f.key}: ${f.value}` === fact);
                      const catColor = matchingFact ? (CATEGORY_COLORS[matchingFact.category] || "text-zinc-400 bg-white/[0.04] border-white/[0.06]") : "text-zinc-400 bg-white/[0.04] border-white/[0.06]";
                      return (
                        <span key={j} className={`inline-flex items-center gap-1 text-[10px] px-2 py-[3px] rounded-lg border font-medium ${catColor}`}>
                          <CheckCircle2 className="w-2.5 h-2.5 text-green-400 shrink-0" />
                          {fact}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              {msg.role === "user" && (
                <div className="w-7 h-7 rounded-xl bg-teal-600/20 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-teal-300" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Scroll to Bottom FAB */}
      {showScrollBtn && (
        <div className="relative">
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10">
            <button
              onClick={scrollToBottom}
              className="flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-[#1a1a1d] border border-white/[0.1] shadow-lg shadow-black/40 text-[12px] font-medium text-zinc-400 hover:text-white hover:bg-[#222225] hover:border-white/[0.15] transition-all active:scale-[0.95] backdrop-blur-sm"
            >
              <ChevronsDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Scroll down</span>
            </button>
          </div>
        </div>
      )}

      {/* Fact counter floating pill */}
      {allFacts.length > 0 && (
        <div className="flex justify-center py-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/15">
            <CheckCircle2 className="w-3 h-3 text-green-400" />
            <span className="text-[11px] text-green-300 font-medium">{allFacts.length} fact{allFacts.length !== 1 ? "s" : ""} saved to memory</span>
          </div>
        </div>
      )}

      {/* Input Bar — matches Chat page styling */}
      <div className="border-t border-white/[0.04] bg-[#0a0a0b] px-3 py-2">
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Tell me about yourself…"
              rows={1}
              className="w-full resize-none rounded-2xl bg-white/[0.05] border border-white/[0.08] px-4 py-2.5 text-[14px] placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-teal-500/30 focus:border-teal-500/30 transition-all max-h-[120px]"
            />
          </div>
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="w-10 h-10 rounded-full bg-teal-600 hover:bg-teal-500 disabled:opacity-30 disabled:hover:bg-teal-600 flex items-center justify-center transition-all shrink-0 active:scale-90"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <ArrowUp className="w-4 h-4 text-white" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
