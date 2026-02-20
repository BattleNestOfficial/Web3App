import { getFirebaseAuth } from '../config/firebase.js';
import { ApiError } from '../utils/ApiError.js';

export async function verifyFirebaseJwt(req, _res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'Missing or invalid Authorization header.');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      throw new ApiError(401, 'Missing bearer token.');
    }

    const decodedToken = await getFirebaseAuth().verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email ?? null
    };

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    // eslint-disable-next-line no-console
    console.error('[auth] Firebase token verification failed:', {
      name: error?.name,
      code: error?.code,
      message: error?.message
    });
    return next(new ApiError(401, 'Unauthorized: invalid Firebase token.'));
  }
}
