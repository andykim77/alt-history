# Alt History Explorer

An interactive alternate-history narrator. Propose a divergence ("what if the printing
press was never invented?") and an LLM narrates how the world unfolds from there.

What makes it more than a chat box:

- **Grounded in real history.** Before narrating, the server identifies the point of
  divergence and pulls the relevant Wikipedia articles. The narrator is instructed to
  verify everything *before* the divergence against those sources and cite them inline
  (`[1]`, `[2]`), and to treat everything *after* it as clearly-labelled speculation.
- **A growing timeline.** Every reply also emits dated events (real, divergence, or
  alternate), rendered as a timeline beside the chat.
- **Branching.** Any reply can be forked ("Branch here") and any of your messages can be
  edited into a new branch. A compare view shows two branches' timelines side by side,
  with the shared history separated from where they diverge.
- **Local persistence.** Scenarios live in your browser's `localStorage`. No accounts.

Built with Next.js (App Router), Tailwind, and [OpenRouter](https://openrouter.ai)'s
free-tier models.

## Setup

1. **Get a free OpenRouter API key**
   - Sign up at https://openrouter.ai and create a key at https://openrouter.ai/keys
   - The free catalog rotates. Browse what is currently live at
     https://openrouter.ai/models?max_price=0 and pick a chat model with a large context
     window (the grounding step feeds several article extracts into the prompt).

2. **Configure environment variables**

   ```bash
   cp .env.local.example .env.local
   ```

   ```
   OPENROUTER_API_KEY=sk-or-v1-...
   OPENROUTER_MODEL=minimax/minimax-m3:free
   SITE_URL=http://localhost:3000
   ```

3. **Install and run**

   ```bash
   npm install
   npm run dev
   ```

   Open http://localhost:3000.

## How it works

```
browser ──POST /api/chat──▶ route.ts
                              │  1. groundTurn()      first turn: LLM extracts divergence year + Wikipedia queries
                              │                       later turns: search Wikipedia with the new message
                              │  2. fetchExtracts()   pull article intros (one batched call)
                              │  3. streamCompletion  narrate with sources in the system prompt
                              ▼
        SSE events: status → meta → sources → delta… → events → done
```

- `app/api/chat/route.ts` holds the API key, orchestrates grounding, and re-streams the
  model output. It strips the machine-readable `---TIMELINE---` block from the prose and
  sends the parsed events as their own SSE message.
- `lib/grounding.ts` decides what to look up; `lib/wikipedia.ts` talks to the MediaWiki API.
- `lib/scenario.ts` is the client-side model: a tree of message nodes per scenario, so
  branching is just choosing a different parent. Persisted to `localStorage`.
- `app/chat-client.tsx` is the shell (sidebar, thread, timeline/sources/compare panel).

Requests per turn against OpenRouter: two on a scenario's first message (grounding +
narration), one afterwards. Free-tier models have per-minute and per-day request limits;
a 429 is surfaced in the chat as a rate-limit message.

## Deploying

Deploys like any Next.js app (e.g. [Vercel](https://vercel.com/new)). Set
`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, and `SITE_URL` (your public URL) as environment
variables on the host. The chat route sets `maxDuration = 60` because grounding plus a
long narration can take 20 to 40 seconds on free models.
