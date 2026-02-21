import { Router } from 'express';
import {
  getDailySummary,
  postMintExtraction
} from '../controllers/aiController.js';
import { verifyFirebaseJwt } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(verifyFirebaseJwt);

router.post('/extract-mint-details', asyncHandler(postMintExtraction));
router.get('/daily-productivity-summary', asyncHandler(getDailySummary));

export const aiRouter = router;
