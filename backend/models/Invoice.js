const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  term: String,
  year: Number,
  items: [{
    feeType: { type: String, required: true },
    amount: { type: Number, default: 0 },
    dueDate: Date
  }],
  total: { type: Number, default: 0 },
  paidTotal: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'issued', 'partial', 'paid', 'overdue'], default: 'draft' },
  issuedAt: Date,
  remarks: String,
  createdAt: { type: Date, default: Date.now }
});

invoiceSchema.index({ studentId: 1, term: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('Invoice', invoiceSchema);