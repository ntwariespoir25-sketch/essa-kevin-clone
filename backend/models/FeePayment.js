const mongoose = require('mongoose');

const feePaymentSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  studentName: String,
  amount: Number,
  feeType: String,
  paymentMethod: { type: String, enum: ['mobile_money', 'cash', 'card', 'bank'], default: 'cash' },
  reference: String,
  paymentDate: Date,
  receiptNo: String,
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  remarks: String,
  status: { type: String, default: 'completed' }
});

module.exports = mongoose.model('FeePayment', feePaymentSchema);