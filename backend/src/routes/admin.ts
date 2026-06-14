import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
router.use(authenticate);
router.use(requireAdmin);

const resetPasswordSchema = z.object({
  email: z.string().email(),
  newPassword: z.string().min(8),
});

router.post('/reset-password', validate(resetPasswordSchema), async (req: Request, res: Response): Promise<void> => {
  const { email, newPassword } = req.body as { email: string; newPassword: string };

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, organisationId: req.user!.organisationId },
  });

  if (!user) {
    res.status(404).json({ error: 'No user with that email found in your organisation' });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  // Revoke all existing refresh tokens so old sessions are invalidated
  await prisma.refreshToken.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } });

  res.json({ message: `Password reset for ${user.email}` });
});

export default router;
