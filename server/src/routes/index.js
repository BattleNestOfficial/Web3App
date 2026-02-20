import { Router } from 'express';
import { mintRouter } from './mintRoutes.js';

const router = Router();

router.use('/mints', mintRouter);

export const apiRouter = router;

