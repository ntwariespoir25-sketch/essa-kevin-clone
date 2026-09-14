const express = require('express');
const { body, validationResult } = require('express-validator');

const Subscription = require('../models/Subscription');
const { publicFormLimiter } = require('../config/rateLimit');

const router = express.Router();

router.post('/subscriptions/subscribe', publicFormLimiter,
  body('email').isEmail().withMessage('A valid email is required'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });
    try {
      const email = req.body.email.toLowerCase();
      let sub = await Subscription.findOne({ email });
      if (sub) {
        if (!sub.isActive) { sub.isActive = true; await sub.save(); }
        return res.json({ success: true, message: 'Subscribed successfully!' });
      }
      await Subscription.create({ email });
      res.json({ success: true, message: 'Subscribed successfully!' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

router.post('/subscriptions/unsubscribe', publicFormLimiter,
  body('email').isEmail().withMessage('A valid email is required'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });
    try {
      await Subscription.findOneAndUpdate({ email: req.body.email.toLowerCase() }, { isActive: false });
      res.json({ success: true, message: 'Unsubscribed successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

module.exports = router;