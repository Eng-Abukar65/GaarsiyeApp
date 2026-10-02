const nodemailer = require('nodemailer');

function assertEmailConfigured() {
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    const error = new Error(`Email delivery is not configured (${missing.join(', ')}).`);
    error.statusCode = 503;
    throw error;
  }
}

function isEmailConfigured() {
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
  return required.every((key) => Boolean(process.env[key]));
}

function getFromAddress() {
  return process.env.SMTP_FROM || process.env.SMTP_USER;
}

function createTransporter() {
  assertEmailConfigured();
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendInitialPassword({ email, name, password }) {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: getFromAddress(),
    to: email,
    subject: 'Your LPG Delivery System account',
    text: `Hello ${name || 'User'},\n\nYour temporary password is: ${password}\n\nSign in and change it immediately. Do not share this password.`,
    html: `<p>Hello ${name || 'User'},</p><p>Your temporary password is:</p><p><strong>${password}</strong></p><p>Sign in and change it immediately. Do not share this password.</p>`
  });
}

async function sendPasswordReset({ email, name, password }) {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: getFromAddress(),
    to: email,
    subject: 'Your vendor password has been reset',
    text: `Hello ${name || 'Vendor'},\n\nYour temporary password is: ${password}\n\nSign in and change it immediately from Settings > Security. Do not share this password.`,
    html: `<p>Hello ${name || 'Vendor'},</p><p>Your temporary password is:</p><p><strong>${password}</strong></p><p>Sign in and change it immediately from <strong>Settings &gt; Security</strong>. Do not share this password.</p>`
  });
}

async function sendVendorPasswordResetToken({ email, name, resetUrl, expirationMinutes = 15 }) {
  const transporter = createTransporter();
  const vendorName = name || 'Vendor';

  await transporter.sendMail({
    from: getFromAddress(),
    to: email,
    subject: 'Reset Your Gaarsiis Vendor Password',
    text: `Hello ${vendorName},\n\nWe received a request to reset your Gaarsiis Vendor Portal password.\n\nClick the button or link below to create a new password:\n${resetUrl}\n\nThis link will expire after ${expirationMinutes} minutes and can only be used once.\n\nIf you did not request this password reset, ignore this email.\n\nGaarsiis System Support Team`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Gaarsiis Vendor Password</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 16px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 540px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 36px 32px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);">
                <!-- Header -->
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <div style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: 800; font-size: 20px; padding: 10px 24px; border-radius: 14px; letter-spacing: 0.5px;">
                      Gaarsiis System
                    </div>
                  </td>
                </tr>
                
                <!-- Main Body -->
                <tr>
                  <td style="color: #1e293b; font-size: 15px; line-height: 1.6;">
                    <p style="margin-top: 0; font-size: 16px; font-weight: 700;">Hello ${vendorName},</p>
                    <p style="color: #475569; margin-bottom: 24px;">We received a request to reset your Gaarsiis Vendor Portal password.</p>
                    <p style="color: #475569; margin-bottom: 24px;">Click the button below to create a new password:</p>
                  </td>
                </tr>

                <!-- Action Button -->
                <tr>
                  <td align="center" style="padding: 12px 0 28px 0;">
                    <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);">Reset Password</a>
                  </td>
                </tr>

                <!-- Expiration Warning -->
                <tr>
                  <td>
                    <div style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 12px; padding: 14px 18px; margin-bottom: 20px;">
                      <p style="color: #e11d48; font-size: 13px; font-weight: 600; margin: 0; line-height: 1.5;">
                        ⏱️ This link will expire after <strong>${expirationMinutes} minutes</strong> and can only be used once.
                      </p>
                    </div>
                  </td>
                </tr>

                <!-- Direct Link Fallback -->
                <tr>
                  <td style="color: #64748b; font-size: 12px; line-height: 1.5; padding-bottom: 20px;">
                    <p style="margin: 0 0 6px 0;">Or copy and paste this URL into your browser:</p>
                    <p style="margin: 0; word-break: break-all;"><a href="${resetUrl}" style="color: #2563eb; text-decoration: underline;">${resetUrl}</a></p>
                  </td>
                </tr>

                <!-- Security Note -->
                <tr>
                  <td style="border-top: 1px solid #f1f5f9; padding-top: 20px; color: #94a3b8; font-size: 12px; line-height: 1.5;">
                    <p style="margin: 0 0 12px 0;">If you did not request this password reset, ignore this email.</p>
                    <p style="margin: 0; font-weight: 700; color: #64748b;">Gaarsiis System Support Team</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  });
}

async function verifyEmailTransport() {
  const transporter = createTransporter();
  await transporter.verify();
}

module.exports = {
  assertEmailConfigured,
  isEmailConfigured,
  sendInitialPassword,
  sendPasswordReset,
  sendVendorPasswordResetToken,
  verifyEmailTransport,
};
