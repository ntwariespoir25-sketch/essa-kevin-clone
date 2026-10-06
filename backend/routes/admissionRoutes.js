const express = require('express');
const { body, validationResult } = require('express-validator');

const AdmissionApplication = require('../models/AdmissionApplication');
const { sendAdmissionConfirmationEmail } = require('../utils/emailService');
const { publicFormLimiter } = require('../config/rateLimit');

const router = express.Router();

router.post('/admissions/submit', publicFormLimiter,
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('dateOfBirth').notEmpty().withMessage('Date of birth is required'),
  body('email').isEmail().withMessage('A valid email is required'),
  body('phone').notEmpty().withMessage('Phone is required'),
  body('address').notEmpty().withMessage('Address is required'),
  body('level').notEmpty().withMessage('Level is required'),
  body('previousSchool').notEmpty().withMessage('Previous school is required'),
  body('lastAverage').isNumeric().withMessage('Last average must be a number'),
  body('parentName').notEmpty().withMessage('Parent name is required'),
  body('parentPhone').notEmpty().withMessage('Parent phone is required'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });
    try {
      const data = req.body;
      const application = await AdmissionApplication.create({
        fullName: data.fullName, dateOfBirth: new Date(data.dateOfBirth),
        nationality: data.nationality || 'Rwandan', nationalId: data.nationalId || '',
        email: data.email.toLowerCase(), phone: data.phone, address: data.address,
        level: data.level, previousSchool: data.previousSchool,
        lastAverage: parseFloat(data.lastAverage), achievements: data.achievements || '',
        parentName: data.parentName, parentPhone: data.parentPhone,
        parentEmail: data.parentEmail || '', parentOccupation: data.parentOccupation || '',
        applyScholarship: data.applyScholarship || false,
        activity: [{ action: 'submitted', detail: 'Application received', at: new Date() }]
      });
    sendAdmissionConfirmationEmail(application).catch(console.error);
    res.json({ success: true, message: 'Application submitted!', applicationNumber: application.applicationNumber });
  } catch (error) {
    // 11000 is the duplicate key on applicationNumber. Two people applying at
    // once can read the same "next" number, so try once more rather than showing
    // the applicant a server error for something that is not their fault.
    if (error.code === 11000) {
      try {
        const application = await AdmissionApplication.create({
          ...req.body,
          email: req.body.email.toLowerCase(),
          dateOfBirth: new Date(req.body.dateOfBirth),
          lastAverage: parseFloat(req.body.lastAverage),
          activity: [{ action: 'submitted', detail: 'Application received', at: new Date() }]
        });
        sendAdmissionConfirmationEmail(application).catch(console.error);
        return res.json({ success: true, message: 'Application submitted!', applicationNumber: application.applicationNumber });
      } catch (retryError) {
        return res.status(500).json({ success: false, message: retryError.message });
      }
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin-side listing, decisions, scoring and printing live in
// admissionsAdminRoutes.js, which is mounted ahead of this file.
module.exports = router;