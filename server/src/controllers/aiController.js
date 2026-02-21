import {
  extractMintDetailsFromTweet,
  generateDailyProductivitySummary
} from '../services/aiService.js';

export async function postMintExtraction(req, res) {
  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  const result = await extractMintDetailsFromTweet(text);
  res.json({ data: result });
}

export async function getDailySummary(_req, res) {
  const result = await generateDailyProductivitySummary();
  res.json({ data: result });
}
