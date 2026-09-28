const express = require('express');
const mongoose = require('mongoose');

const User = require('../models/User');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const authMiddleware = require('../middleware/auth');
const { getIO } = require('../socket');

const router = express.Router();

router.get('/messages/users', authMiddleware, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.userId }, isActive: true }, 'fullName email role profileImage').sort('fullName');
    const grouped = {
      super_admin:      users.filter(u => u.role === 'super_admin'),
      academic_admin:   users.filter(u => u.role === 'academic_admin'),
      discipline_admin: users.filter(u => u.role === 'discipline_admin'),
      accounts_admin:   users.filter(u => u.role === 'accounts_admin'),
      teachers:         users.filter(u => u.role === 'teacher'),
      students:         users.filter(u => u.role === 'student'),
      parents:          users.filter(u => u.role === 'parent')
    };
    res.json({ success: true, users: grouped });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/messages/conversations', authMiddleware, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.userId);
    const conversations = await Conversation.aggregate([
      { $match: { 'participants.userId': userId, isActive: true } },
      { $sort: { lastMessageAt: -1 } }
    ]);

    const unreadCounts = await Message.aggregate([
      { $match: { recipientId: userId, isRead: false, isDeleted: false } },
      { $group: { _id: '$senderId', count: { $sum: 1 } } }
    ]);
    const unreadMap = new Map(unreadCounts.map(u => [String(u._id), u.count]));

    const shaped = conversations.map(conv => {
      const other = (conv.participants || []).find(p => String(p.userId) !== String(userId)) || {};
      return {
        ...conv,
        participant: {
          id: other.userId || null,
          name: other.name || 'Unknown',
          role: other.role || 'user'
        },
        lastMessage: {
          content: conv.lastMessage || '',
          createdAt: conv.lastMessageAt || conv.createdAt
        },
        unreadCount: unreadMap.get(String(other.userId)) || 0
      };
    });

    res.json({ success: true, conversations: shaped });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/messages/mark-read/:userId', authMiddleware, async (req, res) => {
  try {
    const result = await Message.updateMany(
      { senderId: req.params.userId, recipientId: req.userId, isRead: false, isDeleted: false },
      { isRead: true, readAt: new Date() }
    );
    res.json({ success: true, updated: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/messages/conversation/:userId', authMiddleware, async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { senderId: req.userId, recipientId: req.params.userId },
        { senderId: req.params.userId, recipientId: req.userId }
      ],
      isDeleted: false
    }).sort({ createdAt: 1 }).limit(100);
    await Message.updateMany(
      { senderId: req.params.userId, recipientId: req.userId, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/messages/send', authMiddleware, async (req, res) => {
  try {
    const { recipientId, subject, content } = req.body;
    const [sender, recipient] = await Promise.all([User.findById(req.userId), User.findById(recipientId)]);
    if (!sender || !recipient) return res.status(404).json({ success: false, message: 'User not found' });

    const message = await Message.create({
      senderId: req.userId, senderName: sender.fullName, senderRole: sender.role,
      recipientId, recipientName: recipient.fullName, recipientRole: recipient.role,
      subject, content
    });

    let conversation = await Conversation.findOne({ 'participants.userId': { $all: [req.userId, recipientId] }, isActive: true });
    if (conversation) {
      conversation.lastMessage = content.substring(0, 100);
      conversation.lastMessageAt = new Date();
      conversation.messageCount += 1;
      await conversation.save();
    } else {
      conversation = await Conversation.create({
        participants: [
          { userId: req.userId, name: sender.fullName, role: sender.role },
          { userId: recipientId, name: recipient.fullName, role: recipient.role }
        ],
        lastMessage: content.substring(0, 100), lastMessageAt: new Date(), subject, messageCount: 1
      });
    }

    getIO().to(recipientId.toString()).emit('new_message', {
      message: { _id: message._id, senderName: sender.fullName, subject, content, createdAt: message.createdAt },
      conversationId: conversation._id
    });
    res.json({ success: true, message, conversationId: conversation._id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/messages/unread-count', authMiddleware, async (req, res) => {
  try {
    const count = await Message.countDocuments({ recipientId: req.userId, isRead: false, isDeleted: false });
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/messages/:messageId/read', authMiddleware, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Not found' });
    if (message.recipientId.toString() !== req.userId) return res.status(403).json({ success: false, message: 'Unauthorized' });
    message.isRead = true; message.readAt = new Date();
    await message.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/messages/:messageId', authMiddleware, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Not found' });
    if (message.senderId.toString() !== req.userId && message.recipientId.toString() !== req.userId)
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    message.isDeleted = true;
    await message.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;