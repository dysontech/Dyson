// OPTIONAL — Supabase Edge Function that gives the AI Assistant open-ended answers using Claude.
// NOT required: the assistant already works without it (summaries, drafts, translation, search, maths).
//
// Deploy:
//   supabase functions deploy dyson-ai
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (never put this key in config.js)
// Then in config.js:  AI_ENDPOINT: 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/dyson-ai'
// Supabase verifies the signed-in user's JWT before this runs (leave "Verify JWT" on).
// Note: written against the public Anthropic Messages API; test it in your project before relying on it.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "ANTHROPIC_API_KEY is not set" }, 500);
  let body: { messages?: { role: string; content: string }[]; language?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }
  let msgs = (body.messages ?? []).slice(-12).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content ?? "").slice(0, 4000) }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length) return json({ error: "No user message" }, 400);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: Deno.env.get("AI_MODEL") ?? "claude-sonnet-5-5",
      max_tokens: 600,
      system: `You are Dyson Assistant inside the DYSON messaging app. Be concise, friendly and practical. Reply in language code "${body.language ?? "en"}" unless the user writes in another language.`,
      messages: msgs,
    }),
  });
  if (!r.ok) return json({ error: "Upstream error " + r.status }, 502);
  const data = await r.json();
  const reply = (data.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n").trim();
  return json({ reply });
});
