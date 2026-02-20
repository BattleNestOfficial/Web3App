import { Router } from 'express';
import { getAlphaFeed, syncAlphaFeed } from '../controllers/alphaFeedController.js';
import { verifyFirebaseJwt } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(verifyFirebaseJwt);

router.get('/', asyncHandler(getAlphaFeed));
router.post('/sync', asyncHandler(syncAlphaFeed));

export const alphaFeedRouter = router;
