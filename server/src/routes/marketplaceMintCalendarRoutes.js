import { Router } from 'express';
import { getUpcomingMarketplaceMintCalendar } from '../controllers/marketplaceMintCalendarController.js';
import { verifyFirebaseJwt } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(verifyFirebaseJwt);
router.get('/upcoming', asyncHandler(getUpcomingMarketplaceMintCalendar));

export const marketplaceMintCalendarRouter = router;

