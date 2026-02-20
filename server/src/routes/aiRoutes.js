import { Router } from 'express';
import {
  getDailySummary,
  postFarmingTasks,
  postMintExtraction,
  postTweetSummary
} from '../controllers/aiController.js';
import { verifyFirebaseJwt } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(verifyFirebaseJwt);

router.post('/summarize-tweets', asyncHandler(postTweetSummary));
router.post('/extract-mint-details', asyncHandler(postMintExtraction));
router.post('/generate-farming-tasks', asyncHandler(postFarmingTasks));
router.get('/daily-productivity-summary', asyncHandler(getDailySummary));

export const aiRouter = router;
