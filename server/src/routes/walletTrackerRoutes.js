import { Router } from 'express';
import {
  getWalletTracker,
  getWalletTrackerEvents,
  getWalletTrackers,
  postWalletTracker,
  postWalletTrackerSync,
  putWalletTracker,
  removeWalletTracker
} from '../controllers/walletTrackerController.js';
import { verifyFirebaseJwt } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(verifyFirebaseJwt);

router.get('/', asyncHandler(getWalletTrackers));
router.get('/events', asyncHandler(getWalletTrackerEvents));
router.post('/sync', asyncHandler(postWalletTrackerSync));
router.get('/:id', asyncHandler(getWalletTracker));
router.post('/', asyncHandler(postWalletTracker));
router.put('/:id', asyncHandler(putWalletTracker));
router.delete('/:id', asyncHandler(removeWalletTracker));

export const walletTrackerRouter = router;
