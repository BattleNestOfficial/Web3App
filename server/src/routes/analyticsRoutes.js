import { Router } from 'express';
import {
  getApiCostsAnalytics,
  getNftPortfolioAnalytics,
  postApiCostEvent
} from '../controllers/analyticsController.js';
import { verifyFirebaseJwt } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(verifyFirebaseJwt);
router.get('/nft-portfolio', asyncHandler(getNftPortfolioAnalytics));
router.get('/api-costs', asyncHandler(getApiCostsAnalytics));
router.post('/api-costs/events', asyncHandler(postApiCostEvent));

export const analyticsRouter = router;
