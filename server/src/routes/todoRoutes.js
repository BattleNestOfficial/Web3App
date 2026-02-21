import { Router } from 'express';
import {
  getTodoTask,
  getTodoTasks,
  postTodoTask,
  putTodoTask,
  removeTodoTask
} from '../controllers/todoController.js';
import { verifyFirebaseJwt } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(verifyFirebaseJwt);

router.get('/', asyncHandler(getTodoTasks));
router.get('/:id', asyncHandler(getTodoTask));
router.post('/', asyncHandler(postTodoTask));
router.put('/:id', asyncHandler(putTodoTask));
router.delete('/:id', asyncHandler(removeTodoTask));

export const todoRouter = router;
