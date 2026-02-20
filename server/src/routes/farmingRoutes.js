import { Router } from 'express';
import {
  getFarmingProject,
  getFarmingProjects,
  postFarmingProject,
  putFarmingProject,
  removeFarmingProject
} from '../controllers/farmingController.js';
import { verifyFirebaseJwt } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(verifyFirebaseJwt);

router.get('/', asyncHandler(getFarmingProjects));
router.get('/:id', asyncHandler(getFarmingProject));
router.post('/', asyncHandler(postFarmingProject));
router.put('/:id', asyncHandler(putFarmingProject));
router.delete('/:id', asyncHandler(removeFarmingProject));

export const farmingRouter = router;
