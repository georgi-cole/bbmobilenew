'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? '4000', 10);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10);
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '30', 10);
const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS ?? '10000', 10);

const MAX_DIARY_TEXT_LENGTH = 500;
const LLM_MAX_TOKENS = 150;
const LLM_TEMPERATURE = 0.7;

// ─── Canned replies ───────────────────────────────────────────────────────────
const FALLBACKS = [
  "Big Brother has heard your confession. Remember – every word spoken in this room shapes your fate in the house.",
  "Interesting. Big Brother is watching, and your honesty is noted. Play wisely.",
  "Big Brother acknowledges your diary entry. The house has many ears – choose your allies carefully.",
  "Your thoughts have been received. Big Brother reminds you: trust is currency, and it can run out.",
  "Big Brother sees all. Your confession will not be forgotten when the time comes.",
  "The house is full of secrets. Big Brother appreciates your candour. Stay focused.",
  "Noted. Big Brother is always listening. Your game moves are being carefully observed.",
  "Big Brother has received your message. The game is unpredictable – adapt or be evicted.",
];

const REFUSALS = [
  "Big Brother cannot respond to that. Keep things civil in the Diary Room.",
  "That kind of content is not permitted in the Diary Room. Please speak respectfully.",
  "Big Brother must intervene here. Please keep your diary entries appropriate.",
];

// ─── Deterministic helpers ────────────────────────────────────────────────────
/** Mulberry32 PRNG – returns a function that yields floats in [0, 1). */
function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let z = seed;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a-inspired 32-bit hash of a string. */
function fnv32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Pick a deterministic item from an array using seed + text as entropy. */
function deterministicPick(arr, seed, text) {
  const combined = ((seed >>> 0) ^ fnv32(text)) >>> 0;
  const rng = mulberry32(combined);
  const idx = Math.floor(rng() * arr.length);
  return arr[idx];
}

// ─── OpenAI helpers ───────────────────────────────────────────────────────────
/**
 * Returns true if the text should be blocked by moderation.
 * If OPENAI_API_KEY is absent, always returns false (no moderation).
 */
async function moderateTextOpenAI(text) {
  if (!OPENAI_API_KEY) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ input: text }),
      signal: controller.signal,
    });

    if (!res.ok) return false;

    const data = await res.json();
    const result = data?.results?.[0];
    if (!result) return false;

    const cats = result.categories ?? {};
    const blocked =
      cats['violence'] ||
      cats['violence/graphic'] ||
      cats['self-harm'] ||
      cats['self-harm/intent'] ||
      cats['self-harm/instructions'] ||
      cats['illicit'] ||
      cats['illicit/violent'] ||
      cats['harassment/threatening'];

    return Boolean(blocked) || Boolean(result.flagged);
  } catch {
    // Network error or timeout – fail open (do not block)
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calls OpenAI Chat Completions and returns the first choice text, or null on failure.
 */
async function callOpenAIChat(systemPrompt, userMessage) {
  if (!OPENAI_API_KEY) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: LLM_MAX_TOKENS,
        temperature: LLM_TEMPERATURE,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Express app ──────────────────────────────────────────────────────────────
const app = express();

app.use(cors());
app.use(express.json({ limit: '16kb' }));

// Rate-limit all /api/* routes
const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', apiLimiter);

// ─── Health endpoint ──────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// ─── Big Brother AI endpoint ──────────────────────────────────────────────────
app.post('/api/ai/bigbrother', async (req, res) => {
  const { diaryText, playerName, phase, seed } = req.body ?? {};

  if (typeof diaryText !== 'string' || !diaryText.trim()) {
    return res.status(400).json({ error: 'diaryText is required.' });
  }

  const text = diaryText.trim().slice(0, MAX_DIARY_TEXT_LENGTH);
  const name = typeof playerName === 'string' ? playerName.trim() : 'Houseguest';
  const gamePhase = typeof phase === 'string' ? phase : 'unknown';
  const rngSeed = typeof seed === 'number' ? seed : fnv32(text);

  // ── Input moderation ──────────────────────────────────────────────────────
  const inputBlocked = await moderateTextOpenAI(text);
  if (inputBlocked) {
    return res.json({
      text: deterministicPick(REFUSALS, rngSeed, text),
      reason: 'input_moderation',
    });
  }

  // ── Build system prompt ───────────────────────────────────────────────────
  const systemPrompt = [
    'You are Big Brother, the omniscient host of the TV reality show "Big Brother".',
    'You speak directly to a single houseguest in the Diary Room in a calm, authoritative, slightly enigmatic tone.',
    'Keep your response to 1–3 sentences. Do not reveal other houseguests\' secrets.',
    'Do not produce harmful, offensive, or inappropriate content.',
    `Current game phase: ${gamePhase}.`,
    `You are speaking to houseguest: ${name}.`,
  ].join(' ');

  // ── Call LLM ──────────────────────────────────────────────────────────────
  const llmText = await callOpenAIChat(systemPrompt, text);

  if (!llmText) {
    return res.json({
      text: deterministicPick(FALLBACKS, rngSeed, text),
      reason: 'fallback',
    });
  }

  // ── Output moderation ─────────────────────────────────────────────────────
  const outputBlocked = await moderateTextOpenAI(llmText);
  if (outputBlocked) {
    return res.json({
      text: deterministicPick(REFUSALS, rngSeed, text),
      reason: 'output_moderation',
    });
  }

  return res.json({ text: llmText, reason: 'llm' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Big Brother server running on http://localhost:${PORT}`);
});
