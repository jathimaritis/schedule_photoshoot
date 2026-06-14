import { Role, ModuleAccess } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
  moduleAccess: ModuleAccess;
  organisationId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
