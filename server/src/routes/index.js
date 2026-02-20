import { Router } from 'express';
import { farmingRouter } from './farmingRoutes.js';
import { mintRouter } from './mintRoutes.js';

const router = Router();

router.use('/mints', mintRouter);
router.use('/farming', farmingRouter);

export const apiRouter = router;
