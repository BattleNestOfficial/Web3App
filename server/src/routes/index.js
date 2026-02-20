import { Router } from 'express';
import { alphaFeedRouter } from './alphaFeedRoutes.js';
import { analyticsRouter } from './analyticsRoutes.js';
import { aiRouter } from './aiRoutes.js';
import { automationRouter } from './automationRoutes.js';
import { farmingRouter } from './farmingRoutes.js';
import { marketplaceMintCalendarRouter } from './marketplaceMintCalendarRoutes.js';
import { mintRouter } from './mintRoutes.js';
import { walletTrackerRouter } from './walletTrackerRoutes.js';

const router = Router();

router.use('/mints', mintRouter);
router.use('/farming', farmingRouter);
router.use('/alpha-feed', alphaFeedRouter);
router.use('/analytics', analyticsRouter);
router.use('/ai', aiRouter);
router.use('/automation', automationRouter);
router.use('/wallet-trackers', walletTrackerRouter);
router.use('/marketplace-mints', marketplaceMintCalendarRouter);

export const apiRouter = router;
