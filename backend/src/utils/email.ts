import nodemailer from 'nodemailer';

const APP_NAME = 'Shoot Scheduler';

function createTransporter() {
  if (!process.env.SMTP_HOST) {
    return nodemailer.createTransport({ jsonTransport: true });
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendInviteEmail(to: string, inviteUrl: string, _orgName: string): Promise<void> {
  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || `noreply@photoshoot-scheduler.com`,
    to,
    subject: `You have been invited to join ${APP_NAME}`,
    text: [
      `You have been invited to join ${APP_NAME}.`,
      '',
      'Click the link below to set up your account. This link expires in 7 days.',
      '',
      inviteUrl,
    ].join('\n'),
  });
  if (process.env.NODE_ENV !== 'production') {
    console.log('[email] Invite sent (stub):', JSON.stringify(info));
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || `noreply@photoshoot-scheduler.com`,
    to,
    subject: `Reset your ${APP_NAME} password`,
    text: [
      `Someone requested a password reset for your ${APP_NAME} account.`,
      '',
      'Click the link below to reset your password. This link expires in 1 hour.',
      '',
      resetUrl,
      '',
      'If you did not request this, you can safely ignore this email.',
    ].join('\n'),
  });
  if (process.env.NODE_ENV !== 'production') {
    console.log('[email] Password reset sent (stub):', JSON.stringify(info));
  }
}
