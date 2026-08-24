# Alt History Explorer

An interactive chat where you propose a historical divergence ("what if the printing
press was never invented?") and an LLM narrates how the world unfolds from there.
Built with Next.js (App Router) and [OpenRouter](https://openrouter.ai)'s free-tier models.

## Setup

1. **Get a free OpenRouter API key**
   - Sign up at https://openrouter.ai
   - Create a key at https://openrouter.ai/keys
   - Browse currently available free models at https://openrouter.ai/models?max_price=0
     (the free catalog rotates — swap `OPENROUTER_MODEL` below if your chosen model is
     retired or rate-limited)

2. **Configure environment variables**

   ```bash
   cp .env.local.example .env.local
   ```

   Then edit `.env.local` and paste in your key:

   ```
   OPENROUTER_API_KEY=sk-or-v1-...
   OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free
   SITE_URL=http://localhost:3000
   ```

3. **Install and run**

   ```bash
   npm install
   npm run dev
   ```

   Open http://localhost:3000.

## How it works

- `app/api/chat/route.ts` — a server-side route that holds the API key and streams
  responses from OpenRouter's OpenAI-compatible `/chat/completions` endpoint back to
  the browser as Server-Sent Events. The key never reaches client code.
- `app/chat-client.tsx` — the chat UI. Parses the SSE stream token-by-token and renders
  it as it arrives.
- The system prompt (in `route.ts`) frames the model as an alt-history narrator —
  adjust tone/length/rules there.

## Notes on the free tier

OpenRouter's `:free` models have per-minute and per-day rate limits, and the specific
models offered for free change over time. If requests start failing, check
https://openrouter.ai/models?max_price=0 for a currently-available model and update
`OPENROUTER_MODEL` in `.env.local`.

## Deploying

Deploys like any Next.js app (e.g. [Vercel](https://vercel.com/new)) — just set
`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, and `SITE_URL` as environment variables on
the host.
