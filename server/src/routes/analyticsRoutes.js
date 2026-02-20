import { Router } from 'express';
import { getNftPortfolioAnalytics } from '../controllers/analyticsController.js';
import { verifyFirebaseJwt } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(verifyFirebaseJwt);
router.get('/nft-portfolio', asyncHandler(getNftPortfolioAnalytics));

export const analyticsRouter = router;

