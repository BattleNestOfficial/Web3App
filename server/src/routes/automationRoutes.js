import { Router } from 'express';
import {
  getAutomationBilling,
  postAutomationTopUp
} from '../controllers/automationController.js';
import { verifyFirebaseJwt } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(verifyFirebaseJwt);

router.get('/billing', asyncHandler(getAutomationBilling));
router.post('/billing/top-up', asyncHandler(postAutomationTopUp));

export const automationRouter = router;
