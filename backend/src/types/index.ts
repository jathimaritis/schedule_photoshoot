import { Role, ModuleAccess, UserStatus } from '@prisma/client';

export type { UserStatus };

export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
  moduleAccess: ModuleAccess;
  organisationId: string;
  status?: UserStatus;
  accessScheduler?: boolean;
  accessCallSheet?: boolean;
  isAdmin?: boolean;
}

export interface AuthRequest extends Express.Request {
  user?: JwtPayload;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
