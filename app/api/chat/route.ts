import { NextRequest } from "next/server";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are the narrator of an interactive alternate history exploration.
The user proposes a historical divergence (a "what if") or continues one already in progress.
Respond as an engaged, knowledgeable narrator: lay out plausible consequences, name real
people/places/events where it helps grounding, and note where you're speculating vs. drawing
on established history. Keep the tone vivid but not overlong — a few paragraphs per turn — and
end with a light hook or question that invites the user to push the scenario further.`;

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Server is missing OPENROUTER_API_KEY." }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const body = await req.json().catch(() => null);
  const messages: ChatMessage[] | undefined = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: "Missing messages." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free";

  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      // Required by OpenRouter for free-tier usage attribution.
      "HTTP-Referer": process.env.SITE_URL || "http://localhost:3000",
      "X-Title": "Alt History Explorer",
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return new Response(
      JSON.stringify({ error: `OpenRouter error (${upstream.status}): ${text}` }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
