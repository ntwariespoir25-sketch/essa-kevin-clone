const express = require('express');
const { body, validationResult } = require('express-validator');

const Contact = require('../models/Contact');
const emailTransporter = require('../config/email');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');
const { publicFormLimiter } = require('../config/rateLimit');
const { paginate, respondList } = require('../utils/paginate');

const router = express.Router();

router.post('/contact/submit', publicFormLimiter,
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('email').isEmail().withMessage('A valid email is required'),
  body('message').trim().isLength({ min: 5 }).withMessage('Message must be at least 5 characters'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });
    try {
      const { fullName, email, phone, subject, message } = req.body;
      const contact = await Contact.create({ fullName, email: email.toLowerCase(), phone, subject, message });
      if (process.env.EMAIL_USER) {
        emailTransporter.sendMail({
          from: process.env.EMAIL_USER,
          to: process.env.ADMIN_EMAIL || 'admin@essa.rw',
          subject: `📬 New Contact from ${fullName}`,
          html: `<p><b>Name:</b> ${fullName}</p><p><b>Email:</b> ${email}</p><p><b>Phone:</b> ${phone || '-'}</p><p><b>Subject:</b> ${subject || '-'}</p><p><b>Message:</b> ${message}</p>`
        }).catch(console.error);
      }
      res.json({ success: true, message: 'Message sent successfully!' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

router.get('/admin/contacts', authMiddleware, requireRole('super_admin'), async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const total = await Contact.countDocuments();
  const contacts = await Contact.find().sort({ createdAt: -1 }).skip(skip).limit(limit || undefined);
  respondList(res, contacts, { page, limit, total });
});

module.exports = router;