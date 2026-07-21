// ============================================================
// netlify/functions/ask.js  —  BBM Initiative assistant relay
// ============================================================
//
// Holds your Anthropic API key server-side and forwards the chat
// request from the browser. The key never reaches the client.
//
// GITHUB -> NETLIFY SETUP
//   1. Commit this file at:  netlify/functions/ask.js
//      and the netlify.toml at your repo root.
//   2. In Netlify: Site configuration -> Environment variables, add
//         ANTHROPIC_API_KEY = sk-ant-...        (your real key)
//      Optional:
//         BBM_MODEL = claude-sonnet-5           (default below)
//   3. In the site HTML, change one line:
//         const AI_ENDPOINT = "/api/ask";
//   4. git push. Netlify builds and deploys automatically.
//
// The frontend sends { system, messages }. Model and token limits
// are pinned here, so the endpoint can't be repurposed on your key.
// ============================================================

// Confirm the current model string at:
//   https://docs.claude.com/en/docs/about-claude/models/overview
// claude-sonnet-5  = balanced quality/cost (good default)
// claude-haiku-4-5 = cheaper + faster, fine for short Q&A at scale
const MODEL = process.env.BBM_MODEL || "claude-sonnet-5";
const MAX_TOKENS = 1000;

// ---- Input caps (reject oversized requests before spending tokens) ----
const MAX_MESSAGES = 30;
const MAX_MSG_CHARS = 4000;      // per single message
const MAX_TOTAL_CHARS = 24000;   // across all messages

// ---- Per-IP rate limit (best-effort; see note at bottom) ----
const WINDOW_MS = 60 * 1000;     // 1 minute window
const MAX_PER_WINDOW = 15;       // requests per IP per window
const hits = new Map();          // ip -> [timestamps]

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  // Opportunistic cleanup so the map can't grow unbounded.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
    }
  }
  return recent.length > MAX_PER_WINDOW;
}

const json = (statusCode, obj) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(obj),
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(500, { error: "Server missing ANTHROPIC_API_KEY" });
  }

  const ip =
    event.headers["x-nf-client-connection-ip"] ||
    (event.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    "unknown";

  if (isRateLimited(ip)) {
    return json(429, { error: "Too many requests — please slow down." });
  }

  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body || {};
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const { system, messages } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return json(400, { error: "messages array is required" });
  }
  if (messages.length > MAX_MESSAGES) {
    return json(400, { error: "Conversation too long" });
  }

  let total = 0;
  for (const m of messages) {
    const content = typeof m?.content === "string" ? m.content : "";
    if (content.length > MAX_MSG_CHARS) {
      return json(400, { error: "A message is too long" });
    }
    total += content.length;
  }
  if (total > MAX_TOTAL_CHARS) {
    return json(400, { error: "Conversation too long" });
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        ...(typeof system === "string" && system ? { system } : {}),
        messages,
      }),
    });

    const data = await upstream.json();
    return json(upstream.status, data);
  } catch (err) {
    console.error("ask relay error:", err);
    return json(502, { error: "Upstream request failed" });
  }
};

// ---- Note on rate limiting ----
// The limiter above lives in memory, so it resets on cold starts and
// isn't shared across concurrent function instances. That's enough to
// blunt a single abuser hitting a warm instance, but it is NOT a hard
// global cap. For durable limits across all instances, back `hits`
// with Netlify Blobs or an external KV store (e.g. Upstash Redis).
