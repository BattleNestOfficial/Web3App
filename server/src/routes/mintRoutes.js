import { Router } from 'express';
import {
  getMint,
  getMints,
  postMint,
  putMint,
  removeMintById
} from '../controllers/mintController.js';
import { verifyFirebaseJwt } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(verifyFirebaseJwt);

router.get('/', asyncHandler(getMints));
router.get('/:id', asyncHandler(getMint));
router.post('/', asyncHandler(postMint));
router.put('/:id', asyncHandler(putMint));
router.delete('/:id', asyncHandler(removeMintById));

export const mintRouter = router;

