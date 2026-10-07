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

// Sent when an admin records a decision on an application. The internal note the
// reviewer types is deliberately not included: reviewNotes exists for staff, and
// putting it in applicant-facing mail would leak panel deliberations.
const DECISION_COPY = {
  shortlisted: {
    subject: '🎓 You have been shortlisted - ESSA Nyarugunga',
    heading: 'You have been shortlisted',
    body: 'Thank you for applying. The admissions panel has shortlisted your application and will contact you shortly with the next steps.'
  },
  accepted: {
    subject: '🎓 Application accepted - ESSA Nyarugunga',
    heading: 'Congratulations - your application was accepted',
    body: 'Thank you for applying. We are pleased to tell you that your application has been accepted. Our office will contact you with enrolment details.'
  },
  waitlisted: {
    subject: '🎓 Application waitlisted - ESSA Nyarugunga',
    heading: 'Your application is on the waiting list',
    body: 'Thank you for applying. Your application is currently on the waiting list. We will be in touch if a place becomes available.'
  },
  rejected: {
    subject: '🎓 Update on your application - ESSA Nyarugunga',
    heading: 'Update on your application',
    body: 'Thank you for taking the time to apply. We are unable to offer you a place this year.'
  }
};

const sendAdmissionDecisionEmail = async (application) => {
  if (!process.env.EMAIL_USER) return;
  const copy = DECISION_COPY[application.status];
  // Only the four decided states have something to announce; "reviewing" is an
  // internal working state and "pending" already got a confirmation email.
  if (!copy) return;
  await emailTransporter.sendMail({
    from: process.env.EMAIL_USER,
    to: application.email,
    subject: copy.subject,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#1a3a5c,#2c5f8a);color:white;padding:20px;text-align:center;"><h2>${copy.heading}</h2></div>
      <div style="padding:20px;background:#f5f5f5;">
        <h3>Dear ${application.fullName},</h3>
        <p>Application Number: <strong>${application.applicationNumber}</strong></p>
        <p>${copy.body}</p>
      </div></div>`
  });
};

// Plain transactional mail for the notification centre. Guarded the same way as
// the rest of this module: with no EMAIL_USER configured the app must keep
// working and simply not send.
const sendNotificationEmail = async (user, { title, body, link }) => {
  if (!process.env.EMAIL_USER || !user || !user.email) return false;
  const origin = process.env.FRONTEND_URL || 'http://localhost:5174';
  const action = link
    ? `<p style="text-align:center;margin:24px 0;">
         <a href="${link.startsWith('http') ? link : origin + link}"
            style="background:#1a3a5c;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Open</a>
       </p>`
    : '';

  await emailTransporter.sendMail({
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: title,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#1a3a5c,#2c5f8a);color:white;padding:24px;text-align:center;border-radius:10px 10px 0 0;">
        <h2>${title}</h2></div>
      <div style="background:#f5f5f5;padding:24px;border-radius:0 0 10px 10px;">
        <p style="white-space:pre-wrap;">${body || ''}</p>
        ${action}
        <p style="font-size:12px;color:#777;">You are receiving this because of your notification settings in the portal.</p>
      </div></div>`
  });
  return true;
};

const module_exports = { sendWelcomeEmail, sendNewsNotificationEmail, sendAdmissionConfirmationEmail, sendAdmissionDecisionEmail, sendNotificationEmail };
module.exports = module_exports;
