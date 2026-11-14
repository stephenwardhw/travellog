import type { Request, Response, NextFunction } from 'express';
import { verifySessionToken } from '../lib/localAuth.ts';
import { findUserById, type SafeUserRow } from '../db/users.ts';

export interface AuthRequest extends Request {
  user?: SafeUserRow;
  dbUserId?: number;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  const payload = verifySessionToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
  }

  try {
    const dbUser = await findUserById(payload.sub);
    if (!dbUser) {
      return res.status(401).json({ error: 'Unauthorized: Account no longer exists' });
    }
    req.user = dbUser;
    req.dbUserId = dbUser.id;
    next();
  } catch (error) {
    console.error('Auth user lookup error:', error);
    return res.status(500).json({ error: 'Authentication verification failed' });
  }
};

export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Administrator access required' });
  }
  next();
};
