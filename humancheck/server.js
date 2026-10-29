// HumanCheck server: serves the app and proxies two Claude calls (humanize, judge).
// The API key never reaches the browser. Scanning and cleaning run client-side.
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MODEL = process.env.HUMANCHECK_MODEL || "claude-opus-5-5";
const MAX_CHARS = 40_000;

const client = new Anthropic(); // reads ANTHROPIC_API_KEY (or an `ant auth login` profile)
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(here, "public")));

const ready = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
app.get("/api/health", (_req, res) => res.json({ ready, model: MODEL }));

async function complete(prompt, { system, maxTokens }) {
  // Streaming keeps long rewrites clear of HTTP timeouts; server-side fallbacks
  // re-run a safety-classifier decline on Anthropic's recommended substitute.
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system,
    messages: [{ role: "user", content: prompt }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") {
    const why = msg.stop_details?.explanation || "the request was declined";
    throw Object.assign(new Error("Claude declined this draft: " + why), { status: 422 });
  }
  return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

function validate(req, res) {
  const prompt = req.body?.prompt;
  if (typeof prompt !== "string" || !prompt.trim()) { res.status(400).json({ error: "Missing prompt" }); return null; }
  if (prompt.length > MAX_CHARS) { res.status(413).json({ error: `Draft too long (limit ${MAX_CHARS} characters)` }); return null; }
  if (!ready) { res.status(503).json({ error: "Server has no ANTHROPIC_API_KEY. Set it and restart." }); return null; }
  return prompt;
}

app.post("/api/humanize", async (req, res) => {
  const prompt = validate(req, res); if (!prompt) return;
  try {
    const text = await complete(prompt, {
      system: "You are a ghostwriter who makes machine-sounding drafts read like a specific person wrote them. You keep every fact and commitment exactly. You output only the rewritten text.",
      maxTokens: 16000,
    });
    res.json({ text });
  } catch (e) { fail(res, e); }
});

app.post("/api/judge", async (req, res) => {
  const prompt = validate(req, res); if (!prompt) return;
  try {
    const raw = await complete(prompt, {
      system: "You are a calibrated editor screening drafts for signs of machine authorship. You answer with a single JSON object and nothing else.",
      maxTokens: 4000,
    });
    const m = raw.match(/\{[\s\S]*\}/);
    res.json({ result: JSON.parse(m ? m[0] : raw) });
  } catch (e) { fail(res, e); }
});

function fail(res, e) {
  if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "Rate limited by the Claude API. Try again in a moment." });
  if (e instanceof Anthropic.AuthenticationError) return res.status(401).json({ error: "The ANTHROPIC_API_KEY on the server was rejected." });
  if (e instanceof Anthropic.APIConnectionError) return res.status(502).json({ error: "Could not reach the Claude API." });
  if (e instanceof Anthropic.APIError) return res.status(e.status || 500).json({ error: e.message });
  console.error(e);
  res.status(e.status || 500).json({ error: e.message || "Unexpected error" });
}

app.listen(PORT, () => console.log(`HumanCheck on http://localhost:${PORT} (${ready ? "Claude ready, " + MODEL : "no API key: scan-only mode"})`));
