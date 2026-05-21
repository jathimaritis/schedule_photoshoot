import nodemailer from 'nodemailer';

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

export async function sendInviteEmail(to: string, inviteUrl: string, orgName: string): Promise<void> {
  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@photoshoot-scheduler.com',
    to,
    subject: `You've been invited to ${orgName} on Photoshoot Scheduler`,
    html: `
      <h2>You're invited!</h2>
      <p>You've been invited to join <strong>${orgName}</strong> on Photoshoot Scheduler.</p>
      <p><a href="${inviteUrl}" style="background:#1A1A2E;color:#D4AF37;padding:12px 24px;text-decoration:none;border-radius:4px;">Accept Invitation</a></p>
      <p>This link expires in 24 hours.</p>
    `,
  });
  if (process.env.NODE_ENV === 'development') {
    console.log('Invite email (stub):', JSON.stringify(info));
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@photoshoot-scheduler.com',
    to,
    subject: 'Reset your Photoshoot Scheduler password',
    html: `
      <h2>Password Reset</h2>
      <p>Click the link below to reset your password. This link expires in 1 hour.</p>
      <p><a href="${resetUrl}" style="background:#1A1A2E;color:#D4AF37;padding:12px 24px;text-decoration:none;border-radius:4px;">Reset Password</a></p>
    `,
  });
  if (process.env.NODE_ENV === 'development') {
    console.log('Password reset email (stub):', JSON.stringify(info));
  }
}
