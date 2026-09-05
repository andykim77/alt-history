# Alt History Explorer

An interactive alternate-history narrator. Propose a divergence ("what if the printing
press was never invented?") and an LLM narrates how the world unfolds from there.

What makes it more than a chat box:

- **Grounded in real history.** Before narrating, the server identifies the point of
  divergence and pulls the relevant Wikipedia articles. The narrator is instructed to
  verify everything *before* the divergence against those sources and cite them inline
  (`[1]`, `[2]`), and to treat everything *after* it as clearly-labelled speculation.
- **A living dossier, not just a transcript.** Every reply also emits structured
  data that the app folds into the current state of the world:
  - **Timeline**: dated events (real, divergence, or alternate).
  - **Figures**: the people who matter, their status, and their fate in our world
    versus this one.
  - **Powers**: states, dynasties, and institutions with their strategic interests,
    strength, posture, and relations to each other.
  - **Changes**: a year-by-year ledger of "in our world" versus "in this world".
  - **Flashpoints**: three open tensions after each reply, one click to explore.
- **Branching.** Any reply can be forked ("Branch here") and any of your messages can be
  edited into a new branch. A compare view shows two branches' timelines side by side,
  with the shared history separated from where they diverge.
- **Local persistence.** Scenarios live in your browser's `localStorage`. No accounts.
- **English or Korean.** The EN / 한국어 switch in the header changes the whole interface
  (labels, dates such as "기원전 216년 8월 2일", starter prompts) and tells the narrator to
  write in that language, dossier included. The choice is remembered per browser, and
  first-time visitors with a Korean browser start in Korean. Sources stay on English
  Wikipedia for coverage; the narrator reads them and writes Korean.

Built with Next.js (App Router) and Tailwind. The narrator can run on either
[OpenRouter](https://openrouter.ai) (free-tier models, streamed) or the K-Oracle LLM
gateway (Claude, GPT, or Gemini via the `llm-kit-andrewKim` kit; replies arrive in one
piece). Switch with `LLM_PROVIDER`.

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
   LLM_PROVIDER=openrouter
   OPENROUTER_API_KEY=sk-or-v1-...
   OPENROUTER_MODEL=minimax/minimax-m3:free
   SITE_URL=http://localhost:3000
   ```

   **Using the K-Oracle gateway instead.** Set `LLM_PROVIDER=koracle`. Credentials are
   read in place from the kit folder (`LLM_KIT_DIR`, defaulting to the sibling
   `llm-kit-andrewKim-secure_extracted/llm-kit-andrewKim`), or from
   `KORACLE_CREDENTIALS_JSON` on hosts that do not have the folder. Pick the upstream
   with `KORACLE_PROVIDER` (`anthropic` default, `openai`, `google`) and optionally
   `KORACLE_MODEL`. The gateway allows 10 requests per minute and 200 per day, resetting
   at midnight KST, and does not stream, so the reply appears all at once after 15 to
   40 seconds. Its 20k-character cap on the system prompt is respected by trimming the
   Wikipedia extracts (`SOURCE_BUDGET_CHARS` overrides the budget).

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
        SSE events: status → meta → sources → delta… → update → done
```

- `app/api/chat/route.ts` holds the API key, orchestrates grounding, and re-streams the
  model output. It strips the machine-readable `---WORLDSTATE---` block from the prose,
  validates it, and sends the parsed update (events, figures, powers, ledger,
  flashpoints) as its own SSE message. Earlier replies are sent back to the model with
  their update attached, so the dossier stays consistent across turns.
- `lib/llm.ts` is the provider switch (`complete` and `stream`); `lib/openrouter.ts` and
  `lib/koracle.ts` are the two backends. The K-Oracle backend flattens the transcript
  into a single prompt and yields the reply as one chunk.
- `lib/grounding.ts` decides what to look up; `lib/wikipedia.ts` talks to the MediaWiki API.
- `lib/scenario.ts` is the client-side model: a tree of message nodes per scenario, so
  branching is just choosing a different parent. Persisted to `localStorage`.
- `app/chat-client.tsx` is the shell (sidebar, thread, timeline/sources/compare panel).

Requests per turn against OpenRouter: two on a scenario's first message (grounding +
narration), one afterwards. Free-tier models have per-minute and per-day request limits;
a 429 is surfaced in the chat as a rate-limit message.

## Visual audit

`npm run audit:ui` drives the installed Chrome headlessly over CDP (via `puppeteer-core`),
seeds a fixed two-branch scenario into `localStorage`, and screenshots every dossier tab in
light and dark at desktop, tablet, and mobile widths into `ui-audit/`. It makes no LLM
calls. Run it with the dev server up; set `CHROME_PATH` if Chrome is not in the default
location.

## Deploying

Deploys like any Next.js app (e.g. [Vercel](https://vercel.com/new)). Set
`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, and `SITE_URL` (your public URL) as environment
variables on the host. The chat route sets `maxDuration = 60` because grounding plus a
long narration can take 20 to 40 seconds on free models.
