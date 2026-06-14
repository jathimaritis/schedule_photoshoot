import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { verifyAccessToken } from '../utils/jwt';
import { UserStatus } from '../types';
import prisma from '../utils/prisma';

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);
    // Live DB lookup so status changes (approve/restrict) take effect on the next API call
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { isActive: true, status: true, accessScheduler: true, accessCallSheet: true, isAdmin: true },
    });
    if (!dbUser || !dbUser.isActive) {
      res.status(401).json({ error: 'Account not found or inactive' });
      return;
    }
    req.user = {
      ...payload,
      status: (dbUser.status as unknown as UserStatus) ?? 'PENDING',
      accessScheduler: dbUser.accessScheduler ?? false,
      accessCallSheet: dbUser.accessCallSheet ?? false,
      isAdmin: dbUser.isAdmin ?? false,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

const roleHierarchy: Record<Role, number> = {
  VIEWER: 0,
  EDITOR: 1,
  ADMIN: 2,
  OWNER: 3,
};

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const userLevel = roleHierarchy[req.user.role];
    const required = Math.min(...roles.map((r) => roleHierarchy[r]));
    if (userLevel < required) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

export function requireMinRole(role: Role) {
  return requireRole(role);
}

/** Blocks PENDING and RESTRICTED users from accessing any protected resource. */
export function requireApproved(req: Request, res: Response, next: NextFunction): void {
  const status = req.user?.status;
  if (status === 'PENDING') {
    res.status(403).json({ error: 'Account pending approval', code: 'PENDING' });
    return;
  }
  if (status === 'RESTRICTED') {
    res.status(403).json({ error: 'Account has been restricted. Please contact the administrator.', code: 'RESTRICTED' });
    return;
  }
  next();
}

/** Requires isAdmin flag (set by ADMIN_EMAIL env var) or OWNER role. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
  if (req.user.isAdmin || req.user.role === 'OWNER' || req.user.role === 'ADMIN') {
    next();
    return;
  }
  res.status(403).json({ error: 'Admin access required' });
}
