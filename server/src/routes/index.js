import { Router } from 'express';
import { alphaFeedRouter } from './alphaFeedRoutes.js';
import { farmingRouter } from './farmingRoutes.js';
import { mintRouter } from './mintRoutes.js';

const router = Router();

router.use('/mints', mintRouter);
router.use('/farming', farmingRouter);
router.use('/alpha-feed', alphaFeedRouter);

export const apiRouter = router;
