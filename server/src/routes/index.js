import { Router } from 'express';
import { alphaFeedRouter } from './alphaFeedRoutes.js';
import { aiRouter } from './aiRoutes.js';
import { automationRouter } from './automationRoutes.js';
import { farmingRouter } from './farmingRoutes.js';
import { mintRouter } from './mintRoutes.js';

const router = Router();

router.use('/mints', mintRouter);
router.use('/farming', farmingRouter);
router.use('/alpha-feed', alphaFeedRouter);
router.use('/ai', aiRouter);
router.use('/automation', automationRouter);

export const apiRouter = router;
