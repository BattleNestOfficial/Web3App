import {
  extractMintDetailsFromTweet,
  generateDailyProductivitySummary,
  generateFarmingTasksFromTweets,
  summarizeTweets
} from '../services/aiService.js';

function toTweetInput(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') {
        return { text: item };
      }
      if (item && typeof item === 'object') {
        return {
          text: String(item.text ?? ''),
          authorUsername: item.authorUsername ? String(item.authorUsername) : undefined
        };
      }
      return null;
    })
    .filter(Boolean);
}

export async function postTweetSummary(req, res) {
  const tweets = toTweetInput(req.body?.tweets);
  const result = await summarizeTweets(tweets);
  res.json({ data: result });
}

export async function postMintExtraction(req, res) {
  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  const result = await extractMintDetailsFromTweet(text);
  res.json({ data: result });
}

export async function postFarmingTasks(req, res) {
  const tweets = toTweetInput(req.body?.tweets);
  const result = await generateFarmingTasksFromTweets(tweets);
  res.json({ data: result });
}

export async function getDailySummary(_req, res) {
  const result = await generateDailyProductivitySummary();
  res.json({ data: result });
}
