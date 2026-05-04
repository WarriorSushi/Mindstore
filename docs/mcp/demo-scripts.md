# MindStore MCP — demo video scripts

Three short demo videos to show what plugging MindStore into an AI client actually does. The scripts below are shot-by-shot — you should be able to record each in 20–40 minutes, including a couple of takes.

These videos are the proof for the marketing page, the marketplace listings, social posts, and the README. They show what's *uniquely* MindStore: every other "second brain" tool talks about itself; we show what the AI you already use looks like once it has access to your knowledge.

> **Note on credentials:** before recording, mint a fresh API key on the `/app/mcp-setup` page and use it for the demo. After recording, **revoke it from `/app/connect`** so the recorded key is dead. Do not blur or paste-over the key in editing — just kill it server-side.

---

## Pre-flight checklist (do this before any video)

- [ ] Knowledge base has 50+ realistic memories already imported. If you're starting from scratch, run the Kindle highlights demo or import a ChatGPT export so there's substance to query.
- [ ] Your AI provider is configured in MindStore Settings (so server-side features work; not strictly required for the MCP videos but avoids "no AI provider" banners showing up).
- [ ] Browser zoom at 110–125% so text is legible at 1080p.
- [ ] OBS / ScreenFlow / Loom set to **1920×1080**, mouse cursor highlighting **on**, click feedback **on**.
- [ ] Audio: mic close, room quiet. Test 30 seconds, listen back, adjust before the real take.
- [ ] No personal data on screen — close email, Slack, Telegram, banking tabs. Use a fresh browser profile if you can.
- [ ] Increase the default font size in Claude Desktop / Cursor / your terminal so the AI's responses are readable when shrunk for social.

---

## Video 1 — "Claude knows what you know" (Claude Desktop)

**Length:** ~60 seconds
**Hook:** Show Claude failing first (no MCP), then succeeding (with MCP). The contrast is the whole point.
**Where it goes:** Top of `mindstore.org`, X/Twitter, README, marketplace listing hero.

### Shots

1. **Title card** (3s)
   On-screen: "Plug your MindStore into Claude. Watch what changes."
   Voiceover: *"This is Claude Desktop. It's smart, but it doesn't know me."*

2. **Claude without MCP** (10s)
   - Open Claude Desktop in a clean state, MindStore not yet configured
   - Type: *"What did I learn from the books I've read about systems thinking?"*
   - Claude responds with generic textbook content about systems thinking
   - Pause on Claude's response, voiceover: *"Generic answer. Could be from anywhere."*

3. **The setup** (10s)
   - Cmd+Tab to your browser, navigate to `mindstore.org/app/mcp-setup`
   - Click "Mint key" → key appears
   - Click the Copy button on the Claude Desktop card
   - Paste into the config file (show the file path open in a small inset)
   - Voiceover: *"Paste this. Restart Claude. That's it."*

4. **Claude with MCP** (25s)
   - Restart Claude Desktop
   - Show the MCP connection indicator (Claude shows the available tools)
   - Type the *exact same prompt* as in shot 2: *"What did I learn from the books I've read about systems thinking?"*
   - Claude calls `search_mind` (visible in the UI)
   - Claude responds with quotes from your actual highlights, with book titles and authors
   - Voiceover: *"Now Claude is reading my Kindle highlights. From two years ago. With citations."*

5. **The kicker** (10s)
   - Type a follow-up: *"How has my thinking changed since I read those?"*
   - Claude calls `get_timeline`
   - Response shows chronological progression
   - Voiceover: *"Your second brain. In every AI tool you already use."*

6. **End card** (2s)
   - On-screen: "MindStore.org · Try free / self-host"

### Editing notes

- Speed up the config-paste sequence 2–3× so it doesn't feel slow
- Subtle "ding" sound when Claude switches from generic to grounded answers
- Caption Claude's tool calls (`search_mind`, `get_timeline`) in white-on-teal pills synced to when they happen

### Common mistakes to avoid

- Don't show your real notes if any of them contain anything sensitive (work product, client names, etc.). Either curate the demo knowledge base or use a public-data subset.
- Don't speed up Claude's actual response generation — that breaks the "this is real" feeling. Speed up only the human navigation steps.

---

## Video 2 — "Cursor pulled context from my notes while coding" (Cursor)

**Length:** ~75 seconds
**Hook:** Show a coding moment where the AI's answer is *better* because it remembered something the developer learned previously.
**Where it goes:** Cursor's marketplace listing, dev-Twitter, MindStore landing page section "for builders."

### Shots

1. **Title card** (3s)
   On-screen: "Cursor + MindStore. Your past learnings, in your editor."

2. **Setup the scenario** (8s)
   - Wide shot of an open Cursor window. Working on a Postgres-backed Node project.
   - Voiceover: *"I'm wiring up a Postgres feature. Six months ago I read a whole article about connection pooling that I half-remember."*
   - Show a comment in the code: `// TODO: configure pg pool sensibly`

3. **Ask Cursor without MCP** (10s)
   - Cmd+L to open the chat
   - Type: *"How should I configure the connection pool here?"*
   - Cursor gives a generic answer with default values from its training data
   - Voiceover: *"Decent advice, but it's the same advice it'd give anyone."*

4. **Plug MindStore into Cursor** (12s)
   - Cmd+, → MCP settings
   - Paste the JSON snippet from `/app/mcp-setup`
   - "mindstore" appears in the connected servers list
   - Voiceover: *"One config edit. Now Cursor can see what I've read."*

5. **Ask the same question, with context** (30s)
   - Same prompt: *"How should I configure the connection pool here?"*
   - Cursor calls `get_context` (visible in the tool-use sidebar)
   - Response now includes:
     - The specific min/max values from the article you read
     - Reasoning that quotes the article's argument
     - A footnote: *"Based on your Readwise highlight from 'Production Postgres', March 2024"*
   - Voiceover: *"Now it's not just Cursor's training data — it's mine."*

6. **The kicker** (10s)
   - Cursor proposes the actual config diff
   - Accept it, code compiles
   - Type one more prompt: *"Save this decision to my MindStore so future-me doesn't relearn it."*
   - Cursor calls `learn_fact`
   - On-screen confirmation: "Memory saved · ai-taught"
   - Voiceover: *"And the AI writes back to my brain. So I never relearn the same thing twice."*

7. **End card** (2s)
   - On-screen: "MindStore.org/mcp-setup"

### Editing notes

- Caption every MCP tool call as it happens (`get_context`, `learn_fact`) — the visibility is the point
- Show the Readwise-source citation as an overlay; Cursor's UI may render it differently
- The "save this decision" beat is the single most important moment — slow down here, don't rush

---

## Video 3 — "Find contradictions in your own thinking" (Claude Code, terminal)

**Length:** ~50 seconds
**Hook:** A unique-to-MindStore feature (`get_contradictions`) that no other tool has. Pure differentiation video.
**Where it goes:** README, X/Twitter, blog post, MCP marketplace listings.

### Shots

1. **Title card** (3s)
   On-screen: "Has your thinking changed? MindStore knows."

2. **Set the scene** (8s)
   - Terminal open, full-screen, dark theme
   - Voiceover: *"I have 4 years of notes on remote work. My opinions have… evolved."*
   - On-screen note (subtle): "the contradiction-finder plugin has scanned the user's notes overnight and recorded what disagrees with what"

3. **Run Claude Code** (5s)
   - `claude` (start the CLI)
   - The MCP banner shows MindStore is connected
   - Voiceover: *"Claude Code, with MindStore plugged in."*

4. **The prompt** (25s)
   - Type: *"Show me what I've contradicted myself on regarding remote work."*
   - Claude calls `get_contradictions` (visible inline)
   - Response shows 3 pairs of contradicting memories, each with:
     - "From January 2022: 'Async is the only way teams scale...'"
     - "↔ contradicted by July 2025: 'After two years remote, I think real-time collaboration matters more than I admitted.'"
     - Topic label: `remote-work`
   - Voiceover: *"Three years apart. Two of me. MindStore found them automatically."*

5. **Follow-up** (8s)
   - Type: *"Synthesize my current view, given both."*
   - Claude responds with a balanced answer that *cites both* of the user's positions and proposes a synthesis
   - Voiceover: *"It's not arguing one side. It's reading both of mine and helping me see the shift."*

6. **End card** (1s)
   - On-screen: "MindStore.org · Devil's Advocate, but it's you."

### Editing notes

- This is a text-heavy video — make sure the terminal text is large and legible
- Add a subtle mid-track "tension" music cue when the contradiction pair is revealed
- The voiceover line *"Three years apart. Two of me."* is the thumbnail quote

---

## Optional bonus video — "Self-host vs cloud, in 30 seconds"

**Length:** 30s
**Hook:** Address the privacy/control concern up front.
**Where it goes:** A pinned tweet, the README, the pricing page.

### Single-take script

1. (5s) "Two ways to use MindStore."
   - Show two browser windows side-by-side: cloud + localhost
2. (10s) Cloud:
   - Click around `mindstore.org/app` — quick montage of dashboard, search, plugins
   - Voiceover: "Hosted by us. Sign up, plug in your AI, ready in 30 seconds."
3. (10s) Self-host:
   - Show terminal: `git clone … && npm install && npm run migrate && npm run dev`
   - Browser: `localhost:3000` opens to the same UI
   - Voiceover: "Or run it on your own machine. Same software. Your hardware."
4. (5s) Both windows visible:
   - Click "Export to .mind" on cloud, drag the file into the localhost window's Import page
   - Voiceover: "And the .mind file moves your brain between them."

---

## Where these go after recording

| Video | Primary destination | Cuts to also produce |
|---|---|---|
| Claude Desktop demo | mindstore.org hero | 15s vertical for X / Threads, 30s landscape for LinkedIn |
| Cursor demo | Cursor marketplace listing, dev-Twitter | 15s vertical of the "save this decision" moment |
| Contradictions demo | README hero, blog "weird MCP tools" post | 8s thumbnail GIF of the contradiction pair reveal |
| Self-host vs cloud | Pricing page, pinned tweet | None — keep it as one piece |

## Recording day checklist

- [ ] OBS scenes pre-built for each demo
- [ ] Demo knowledge base loaded (the same one across all three videos for continuity)
- [ ] Audio test recorded and reviewed
- [ ] All three AI clients (Claude Desktop, Cursor, Claude Code) authenticated and on stable versions
- [ ] Backup take of every shot — nothing kills momentum like wishing you had a second pass
- [ ] Captured separately: the on-screen text overlays. Add in post.

After recording, revoke the demo API key from `/app/connect` and confirm it no longer works (`curl -H "Authorization: Bearer <revoked-key>" https://mindstore.org/api/mcp` should 401).
