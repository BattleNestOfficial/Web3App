import { env } from '../config/env.js';
import { pool } from '../config/db.js';
import { recordApiUsageSafely } from './apiCostService.js';

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function parseJsonObject(input) {
  const text = String(input ?? '').trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

function toTweetTextList(inputTweets) {
  if (!Array.isArray(inputTweets)) return [];
  const lines = [];

  for (const tweet of inputTweets) {
    if (typeof tweet === 'string') {
      const text = normalizeText(tweet);
      if (text) lines.push(text);
      continue;
    }

    if (tweet && typeof tweet === 'object') {
      const author = normalizeText(tweet.authorUsername ?? tweet.author ?? '');
      const text = normalizeText(tweet.text ?? '');
      if (!text) continue;
      lines.push(author ? `@${author}: ${text}` : text);
    }
  }

  return lines;
}

async function callOpenAiJson({ systemPrompt, userPrompt }) {
  if (!env.ai.openAiApiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.ai.requestTimeoutMs);
  const startedAt = Date.now();
  let logged = false;

  try {
    const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.ai.openAiApiKey}`
      },
      body: JSON.stringify({
        model: env.ai.openAiModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text();
      void recordApiUsageSafely({
        providerKey: 'openai',
        operation: 'chat_completions',
        endpoint: OPENAI_CHAT_COMPLETIONS_URL,
        requestCount: 1,
        statusCode: response.status,
        success: false,
        metadata: {
          model: env.ai.openAiModel,
          durationMs: Date.now() - startedAt
        }
      });
      logged = true;
      throw new Error(`OpenAI request failed (${response.status}): ${body || 'unknown error'}`);
    }

    const payload = await response.json();
    const promptTokens = Number(payload?.usage?.prompt_tokens ?? 0) || 0;
    const completionTokens = Number(payload?.usage?.completion_tokens ?? 0) || 0;
    void recordApiUsageSafely({
      providerKey: 'openai',
      operation: 'chat_completions',
      endpoint: OPENAI_CHAT_COMPLETIONS_URL,
      requestCount: 1,
      inputTokens: Math.max(0, Math.floor(promptTokens)),
      outputTokens: Math.max(0, Math.floor(completionTokens)),
      statusCode: response.status,
      success: true,
      metadata: {
        model: env.ai.openAiModel,
        durationMs: Date.now() - startedAt
      }
    });
    logged = true;
    const content = payload?.choices?.[0]?.message?.content;
    const parsed = parseJsonObject(content);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('OpenAI returned non-JSON content.');
    }
    return parsed;
  } catch (error) {
    if (logged) {
      throw error;
    }
    void recordApiUsageSafely({
      providerKey: 'openai',
      operation: 'chat_completions',
      endpoint: OPENAI_CHAT_COMPLETIONS_URL,
      requestCount: 1,
      success: false,
      metadata: {
        model: env.ai.openAiModel,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error)
      }
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function summarizeTweets(inputTweets) {
  const tweets = toTweetTextList(inputTweets).slice(0, 40);
  if (tweets.length === 0) {
    return {
      summary: 'No tweets available to summarize.',
      highlights: []
    };
  }

  try {
    const aiResult = await callOpenAiJson({
      systemPrompt:
        'You summarize web3 ecosystem updates. Return strict JSON: {"summary":"string","highlights":["string"]}. Keep highlights short.',
      userPrompt: `Summarize these tweets and extract 3-6 key highlights:\n\n${tweets
        .map((tweet, index) => `${index + 1}. ${tweet}`)
        .join('\n')}`
    });

    if (aiResult) {
      const summary = normalizeText(aiResult.summary);
      const highlights = Array.isArray(aiResult.highlights)
        ? aiResult.highlights.map((item) => normalizeText(item)).filter(Boolean).slice(0, 6)
        : [];

      if (summary) {
        return { summary, highlights };
      }
    }
  } catch {
    // Fallback below.
  }

  const highlights = tweets.slice(0, 5).map((tweet) => {
    const compact = tweet.length > 140 ? `${tweet.slice(0, 137)}...` : tweet;
    return compact;
  });

  return {
    summary: `Tracked ${tweets.length} relevant updates. Most activity is concentrated around launch and incentive updates.`,
    highlights
  };
}

function extractLinks(text) {
  const matches = text.match(/https?:\/\/[^\s]+/gi) ?? [];
  return Array.from(new Set(matches.map((item) => item.trim())));
}

function detectChain(text) {
  const normalized = text.toLowerCase();
  if (normalized.includes('ethereum') || normalized.includes('eth mainnet')) return 'Ethereum';
  if (normalized.includes('solana')) return 'Solana';
  if (normalized.includes('base')) return 'Base';
  if (normalized.includes('arbitrum')) return 'Arbitrum';
  if (normalized.includes('optimism') || normalized.includes('op mainnet')) return 'Optimism';
  if (normalized.includes('polygon')) return 'Polygon';
  if (normalized.includes('avax') || normalized.includes('avalanche')) return 'Avalanche';
  if (normalized.includes('bnb') || normalized.includes('bsc')) return 'BNB Chain';
  return 'Unknown';
}

function detectMintType(text) {
  const normalized = text.toLowerCase();
  if (normalized.includes('whitelist') || normalized.includes('allowlist') || normalized.includes(' wl ')) {
    return 'whitelist';
  }
  if (normalized.includes('public mint') || normalized.includes('public sale') || normalized.includes('public')) {
    return 'public';
  }
  return 'unknown';
}

function detectMintDate(text) {
  const datePatterns = [
    /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?(?:\s+\d{1,2}:\d{2}(?:\s?(?:am|pm|utc))?)?\b/i,
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?(?:\s+\d{1,2}:\d{2}(?:\s?(?:am|pm|utc))?)?\b/i
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) return normalizeText(match[0]);
  }
  return null;
}

function detectProjectName(text) {
  const tokenMatch = text.match(/\$([A-Za-z0-9_]{2,15})/);
  if (tokenMatch) return tokenMatch[1].toUpperCase();

  const mentionMatch = text.match(/@([A-Za-z0-9_]{2,20})/);
  if (mentionMatch) return mentionMatch[1];

  const mintMatch = text.match(/([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,2})\s+(?:mint|drop|launch)/);
  if (mintMatch) return normalizeText(mintMatch[1]);

  return null;
}

export async function extractMintDetailsFromTweet(textInput) {
  const text = normalizeText(textInput);
  if (!text) {
    return {
      projectName: null,
      chain: 'Unknown',
      mintDate: null,
      mintType: 'unknown',
      links: [],
      confidence: 0,
      notes: 'No tweet text provided.'
    };
  }

  try {
    const aiResult = await callOpenAiJson({
      systemPrompt:
        'Extract mint details from crypto tweets. Return strict JSON with keys: projectName (string|null), chain (string), mintDate (string|null), mintType ("whitelist"|"public"|"unknown"), links (string[]), confidence (0..1), notes (string).',
      userPrompt: `Tweet:\n${text}`
    });

    if (aiResult) {
      return {
        projectName: aiResult.projectName ?? null,
        chain: normalizeText(aiResult.chain) || 'Unknown',
        mintDate: aiResult.mintDate ? normalizeText(aiResult.mintDate) : null,
        mintType: ['whitelist', 'public', 'unknown'].includes(String(aiResult.mintType))
          ? String(aiResult.mintType)
          : 'unknown',
        links: Array.isArray(aiResult.links)
          ? aiResult.links.map((item) => normalizeText(item)).filter(Boolean)
          : [],
        confidence: clamp(Number(aiResult.confidence) || 0, 0, 1),
        notes: normalizeText(aiResult.notes) || 'AI extraction complete.'
      };
    }
  } catch {
    // Fallback below.
  }

  const projectName = detectProjectName(text);
  const chain = detectChain(text);
  const mintDate = detectMintDate(text);
  const mintType = detectMintType(text);
  const links = extractLinks(text);
  const confidence =
    (projectName ? 0.3 : 0) + (chain !== 'Unknown' ? 0.2 : 0) + (mintDate ? 0.2 : 0) + (mintType !== 'unknown' ? 0.2 : 0) + (links.length > 0 ? 0.1 : 0);

  return {
    projectName,
    chain,
    mintDate,
    mintType,
    links,
    confidence: clamp(confidence, 0, 1),
    notes: 'Fallback extraction based on keyword heuristics.'
  };
}

function dedupeTasks(tasks) {
  const seen = new Set();
  const output = [];
  for (const task of tasks) {
    const title = normalizeText(task.title);
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({
      title,
      priority: ['low', 'medium', 'high'].includes(task.priority) ? task.priority : 'medium',
      reason: normalizeText(task.reason) || 'Derived from tracked tweets.'
    });
  }
  return output.slice(0, 10);
}

export async function generateFarmingTasksFromTweets(inputTweets) {
  const tweets = toTweetTextList(inputTweets).slice(0, 40);
  if (tweets.length === 0) {
    return { tasks: [] };
  }

  try {
    const aiResult = await callOpenAiJson({
      systemPrompt:
        'Generate actionable farming tasks from tweets. Return strict JSON: {"tasks":[{"title":"string","priority":"low|medium|high","reason":"string"}]}. Keep titles concise.',
      userPrompt: `Create farming tasks from these tweets:\n\n${tweets.map((tweet, index) => `${index + 1}. ${tweet}`).join('\n')}`
    });

    if (aiResult && Array.isArray(aiResult.tasks)) {
      const tasks = dedupeTasks(aiResult.tasks);
      if (tasks.length > 0) {
        return { tasks };
      }
    }
  } catch {
    // Fallback below.
  }

  const fallbackTasks = [];
  for (const tweet of tweets) {
    const text = tweet.toLowerCase();
    if (text.includes('testnet')) {
      fallbackTasks.push({
        title: 'Join announced testnet and complete core quests',
        priority: 'high',
        reason: 'Tweet mentions a live or upcoming testnet.'
      });
    }
    if (text.includes('airdrop') || text.includes('points')) {
      fallbackTasks.push({
        title: 'Track points/airdrop requirements for this project',
        priority: 'high',
        reason: 'Tweet references airdrop or points incentives.'
      });
    }
    if (text.includes('bridge') || text.includes('swap') || text.includes('stake')) {
      fallbackTasks.push({
        title: 'Execute on-chain actions (bridge/swap/stake) for eligibility',
        priority: 'medium',
        reason: 'Tweet highlights activity-driven farming paths.'
      });
    }
    if (text.includes('mint')) {
      fallbackTasks.push({
        title: 'Prepare wallet + funding checklist before mint window',
        priority: 'medium',
        reason: 'Tweet indicates mint-related schedule risk.'
      });
    }
  }

  return { tasks: dedupeTasks(fallbackTasks) };
}

async function loadDailyMetrics() {
  const [mintsUpcomingResult, remindersResult, farmingResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM mints
       WHERE mint_date >= NOW() AND mint_date <= NOW() + INTERVAL '24 hours'`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM reminders
       WHERE sent_at IS NULL AND remind_at >= NOW() AND remind_at <= NOW() + INTERVAL '24 hours'`
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS total_projects,
         COALESCE(ROUND(AVG(progress))::int, 0) AS avg_progress,
         COUNT(*) FILTER (WHERE claim_date IS NOT NULL AND claim_date <= NOW() + INTERVAL '24 hours')::int AS claims_due_24h
       FROM farming_projects`
    )
  ]);

  return {
    mintsUpcoming24h: mintsUpcomingResult.rows[0]?.count ?? 0,
    remindersDue24h: remindersResult.rows[0]?.count ?? 0,
    farmingProjects: farmingResult.rows[0]?.total_projects ?? 0,
    farmingAvgProgress: farmingResult.rows[0]?.avg_progress ?? 0,
    farmingClaimsDue24h: farmingResult.rows[0]?.claims_due_24h ?? 0
  };
}

export async function generateDailyProductivitySummary() {
  const metrics = await loadDailyMetrics();
  const generatedAt = new Date().toISOString();

  try {
    const aiResult = await callOpenAiJson({
      systemPrompt:
        'You generate concise daily productivity summaries for a web3 operations dashboard. Return strict JSON: {"summary":"string","focusItems":["string"],"riskItems":["string"]}.',
      userPrompt: `Metrics:\n${JSON.stringify(metrics, null, 2)}`
    });

    if (aiResult) {
      return {
        summary: normalizeText(aiResult.summary) || 'Daily summary generated.',
        focusItems: Array.isArray(aiResult.focusItems)
          ? aiResult.focusItems.map((item) => normalizeText(item)).filter(Boolean).slice(0, 5)
          : [],
        riskItems: Array.isArray(aiResult.riskItems)
          ? aiResult.riskItems.map((item) => normalizeText(item)).filter(Boolean).slice(0, 5)
          : [],
        metrics,
        generatedAt,
        source: 'ai'
      };
    }
  } catch {
    // Fallback below.
  }

  const focusItems = [];
  const riskItems = [];

  if (metrics.mintsUpcoming24h > 0) {
    focusItems.push(`Prepare ${metrics.mintsUpcoming24h} upcoming mint event(s) in the next 24h.`);
  }
  if (metrics.farmingClaimsDue24h > 0) {
    focusItems.push(`Process ${metrics.farmingClaimsDue24h} farming claim reminder(s) due in 24h.`);
  }
  if (metrics.remindersDue24h > 8) {
    riskItems.push('High reminder volume can cause missed actions; prioritize critical reminders first.');
  }
  if (metrics.farmingAvgProgress < 50 && metrics.farmingProjects > 0) {
    riskItems.push('Average farming progress is below 50%; focus on high-priority tasks.');
  }

  return {
    summary: `You have ${metrics.mintsUpcoming24h} mint(s) and ${metrics.farmingClaimsDue24h} claim(s) to process over the next 24 hours.`,
    focusItems,
    riskItems,
    metrics,
    generatedAt,
    source: 'fallback'
  };
}
