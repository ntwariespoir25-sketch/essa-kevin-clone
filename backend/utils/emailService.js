const jwt = require('jsonwebtoken');

const emailTransporter = require('../config/email');
const Subscription = require('../models/Subscription');
const { getJWTSecret } = require('./jwt');

const buildSetupLink = (userId) => {
  const token = jwt.sign({ id: userId, purpose: 'setup' }, getJWTSecret(), { expiresIn: '24h' });
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${baseUrl}/set-password?token=${token}`;
};

const sendWelcomeEmail = async (user) => {
  if (!process.env.EMAIL_USER) return;
  const setupLink = user._id ? buildSetupLink(user._id) : null;
  await emailTransporter.sendMail({
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: `Welcome to ESSA Nyarugunga Portal, ${user.fullName}!`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#1a3a5c,#2c5f8a);color:white;padding:30px;text-align:center;border-radius:10px 10px 0 0;">
        <h2>🎓 Welcome to ESSA Nyarugunga Portal</h2></div>
      <div style="background:#f5f5f5;padding:30px;border-radius:0 0 10px 10px;">
        <h3>Dear ${user.fullName},</h3>
        <p>Your account has been created successfully.</p>
        <div style="background:white;padding:15px;border-radius:8px;border-left:4px solid #ffc107;">
          <p><strong>Email:</strong> ${user.email}</p>
          <p><strong>Role:</strong> ${user.role?.toUpperCase()}</p>
        </div>
        ${setupLink ? `
        <p style="margin-top:16px;">To set your password and activate your account, click the button below:</p>
        <p style="text-align:center;margin:20px 0;">
          <a href="${setupLink}" style="background:#1a3a5c;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Set Your Password</a>
        </p>
        <p style="font-size:12px;color:#777;">This link is valid for 24 hours. If it expires, please contact the school administration.</p>` : ''}
        <p>Best regards,<br><strong>ESSA Nyarugunga Administration</strong></p>
      </div></div>`
  });
};

const sendNewsNotificationEmail = async (news) => {
  if (!process.env.EMAIL_USER) return;
  const subscribers = await Subscription.find({ isActive: true });
  for (const sub of subscribers) {
    await emailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to: sub.email,
      subject: `📰 New: ${news.title} - ESSA Nyarugunga`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#1a3a5c,#2c5f8a);color:white;padding:20px;text-align:center;"><h2>📢 New Update</h2></div>
        <div style="padding:20px;"><h3>${news.title}</h3><p>${news.summary}</p></div></div>`
    }).catch(console.error);
  }
};

const sendAdmissionConfirmationEmail = async (application) => {
  if (!process.env.EMAIL_USER) return;
  await emailTransporter.sendMail({
    from: process.env.EMAIL_USER,
    to: application.email,
    subject: `🎓 Admission Application Received - ESSA Nyarugunga`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#1a3a5c,#2c5f8a);color:white;padding:20px;text-align:center;"><h2>Application Received!</h2></div>
      <div style="padding:20px;background:#f5f5f5;">
        <h3>Dear ${application.fullName},</h3>
        <p>Application Number: <strong>${application.applicationNumber}</strong></p>
        <p>Status: Pending Review. We'll contact you within 3–5 business days.</p>
      </div></div>`
  });
};

module.exports = { sendWelcomeEmail, sendNewsNotificationEmail, sendAdmissionConfirmationEmail };