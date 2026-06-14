import { Role, ModuleAccess } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
  moduleAccess: ModuleAccess;
  organisationId: string;
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
