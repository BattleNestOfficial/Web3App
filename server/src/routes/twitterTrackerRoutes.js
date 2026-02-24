import { Router } from 'express';
import {
  getTwitterMessages,
  getTwitterTracker,
  getTwitterTrackers,
  postTwitterTracker,
  postTwitterTrackerSync,
  putTwitterTracker,
  removeTwitterTracker
} from '../controllers/twitterTrackerController.js';
import { verifyFirebaseJwt } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(verifyFirebaseJwt);

router.get('/', asyncHandler(getTwitterTrackers));
router.get('/messages', asyncHandler(getTwitterMessages));
router.post('/sync', asyncHandler(postTwitterTrackerSync));
router.get('/:id', asyncHandler(getTwitterTracker));
router.post('/', asyncHandler(postTwitterTracker));
router.put('/:id', asyncHandler(putTwitterTracker));
router.delete('/:id', asyncHandler(removeTwitterTracker));

export const twitterTrackerRouter = router;

