const express = require('express');

const FeeStructure = require('../models/FeeStructure');
const FeePayment = require('../models/FeePayment');
const Salary = require('../models/Salary');
const Budget = require('../models/Budget');
const Income = require('../models/Income');
const Expense = require('../models/Expense');
const Invoice = require('../models/Invoice');
const Class = require('../models/Class');
const Student = require('../models/Student');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');

const router = express.Router();

const resolveInvoiceStatus = (inv) => {
  if (inv.paidTotal >= inv.total && inv.total > 0) return 'paid';
  if (inv.paidTotal > 0) return 'partial';
  if (inv.dueDate && new Date(inv.dueDate) < new Date()) return 'overdue';
  return inv.status === 'issued' ? 'issued' : 'draft';
};

const withClassName = (inv) => {
  const obj = inv.toObject ? inv.toObject() : inv;
  obj.status = resolveInvoiceStatus(inv);
  obj.balance = (inv.total || 0) - (inv.paidTotal || 0);
  const c = inv.studentId?.classId;
  obj.className = c ? `${c.grade || ''} ${c.className || ''}`.trim() || '—' : '—';
  return obj;
};

// ==================== FEES ====================
router.get('/accounts/fee-structures', authMiddleware, requireRole('accounts_admin', 'super_admin'), async (req, res) => {
  const feeStructures = await FeeStructure.find().populate('classId', 'grade className').sort({ createdAt: -1 });
  res.json(feeStructures);
});

router.post('/accounts/fee-structures', authMiddleware, requireRole('accounts_admin', 'super_admin'), async (req, res) => {
  try {
    const feeStructure = await FeeStructure.create(req.body);
    res.json({ success: true, feeStructure });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/accounts/fee-structures/:id', authMiddleware, requireRole('accounts_admin', 'super_admin'), async (req, res) => {
  await FeeStructure.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

router.get('/accounts/payments', authMiddleware, requireRole('accounts_admin', 'super_admin'), async (req, res) => {
  const payments = await FeePayment.find().populate('studentId', 'fullName studentId').sort({ paymentDate: -1 });
  res.json(payments);
});

router.post('/accounts/payments', authMiddleware, requireRole('accounts_admin', 'super_admin'), async (req, res) => {
  try {
    const { studentId, feeType, amount, paymentMethod, reference, remarks, invoiceId } = req.body;
    if (!studentId || !amount) return res.status(400).json({ message: 'studentId and amount are required' });

    let invoice = null;
    if (invoiceId) {
      invoice = await Invoice.findById(invoiceId);
      if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    } else if (studentId) {
      invoice = await Invoice.findOne({ studentId }).sort({ createdAt: -1 });
    }

    const student = await Student.findById(studentId).select('fullName studentId classId');
    const count = await FeePayment.countDocuments();
    const receiptNo = `RCP-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    const payment = await FeePayment.create({
      studentId,
      studentName: student?.fullName || req.body.studentName || '—',
      amount: Number(amount),
      feeType: invoice && invoice.items.length ? invoice.items[0].feeType : (feeType || 'School Fees'),
      paymentMethod: paymentMethod || 'cash',
      reference: reference || '',
      paymentDate: new Date(),
      receiptNo,
      receivedBy: req.userId,
      invoiceId: invoice?._id,
      remarks: remarks || '',
      status: 'completed'
    });

    if (invoice) {
      invoice.paidTotal = (invoice.paidTotal || 0) + Number(amount);
      invoice.status = resolveInvoiceStatus(invoice);
      await invoice.save();
    }

    res.json({ success: true, payment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== INVOICES ====================
router.get('/accounts/invoices', authMiddleware, requireRole('accounts_admin', 'super_admin'), async (req, res) => {
  const { term, year, status } = req.query;
  const filter = {};
  if (term) filter.term = term;
  if (year) filter.year = Number(year);
  if (status) filter.status = status;
  const invoices = await Invoice.find(filter)
    .populate({ path: 'studentId', select: 'fullName studentId classId', populate: { path: 'classId', select: 'grade className' } })
    .sort({ year: -1, createdAt: -1 });
  res.json(invoices.map(withClassName));
});

router.post('/accounts/invoices/generate', authMiddleware, requireRole('accounts_admin', 'super_admin'), async (req, res) => {
  try {
    const { term, year, classId } = req.body;
    if (!term || !year) return res.status(400).json({ message: 'term and year are required' });

    const classes = classId ? await Class.find({ _id: classId }) : await Class.find();
    let created = 0, updated = 0;

    for (const c of classes) {
      const fees = await FeeStructure.find({ classId: c._id });
      if (fees.length === 0) continue;
      const students = await Student.find({ classId: c._id, isActive: true });
      for (const s of students) {
        const items = fees.map(f => ({ feeType: f.feeType, amount: f.amount || 0, dueDate: f.dueDate }));
        const total = items.reduce((a, b) => a + b.amount, 0);
        const existing = await Invoice.findOne({ studentId: s._id, term, year });
        if (existing) {
          const wasPaid = existing.status === 'paid';
          existing.items = items;
          existing.total = total;
          if (!wasPaid) existing.status = 'issued';
          await existing.save();
          updated++;
        } else {
          await Invoice.create({ studentId: s._id, term, year, items, total, status: 'issued', issuedAt: new Date() });
          created++;
        }
      }
    }
    res.json({ success: true, created, updated, message: `${created} invoices created, ${updated} updated` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/accounts/invoices/:id', authMiddleware, requireRole('accounts_admin', 'super_admin'), async (req, res) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate({ path: 'studentId', select: 'fullName studentId classId parentName parentPhone', populate: { path: 'classId', select: 'grade className' } });
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
  const payments = await FeePayment.find({ invoiceId: invoice._id }).sort({ paymentDate: -1 });
  res.json({ success: true, invoice: withClassName(invoice), payments });
});

router.put('/accounts/invoices/:id/status', authMiddleware, requireRole('accounts_admin', 'super_admin'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['draft', 'issued', 'paid', 'canceled'].includes(status)) return res.status(400).json({ message: 'Invalid status' });
    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      { status, issuedAt: status === 'issued' ? new Date() : undefined },
      { new: true }
    );
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    res.json({ success: true, invoice: withClassName(invoice) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== RECEIPTS ====================
router.get('/accounts/receipts/:receiptNo', authMiddleware, requireRole('accounts_admin', 'super_admin'), async (req, res) => {
  const payment = await FeePayment.findOne({ receiptNo: req.params.receiptNo })
    .populate({ path: 'studentId', select: 'fullName studentId classId parentName parentPhone', populate: { path: 'classId', select: 'grade className' } })
    .populate({ path: 'receivedBy', select: 'fullName' });
  if (!payment) return res.status(404).json({ message: 'Receipt not found' });
  const invoice = payment.invoiceId ? await Invoice.findById(payment.invoiceId) : null;
  res.json({ success: true, receipt: payment, invoice });
});

// ==================== FEE ANALYTICS ====================
router.get('/accounts/fee-analytics', authMiddleware, requireRole('accounts_admin', 'super_admin'), async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const invoices = await Invoice.find({ year })
      .populate('studentId', 'fullName studentId classId')
      .populate({ path: 'studentId', populate: { path: 'classId', select: 'grade className' } });
    const payments = await FeePayment.find({ paymentDate: { $gte: new Date(`${year}-01-01`), $lt: new Date(`${year + 1}-01-01`) } });

    const totalExpected = invoices.reduce((a, b) => a + (b.total || 0), 0);
    const totalCollected = invoices.reduce((a, b) => a + (b.paidTotal || 0), 0);

    const byClass = {};
    const byFeeType = {};
    invoices.forEach(inv => {
      const key = inv.studentId?.classId ? `${inv.studentId.classId.grade || ''} ${inv.studentId.classId.className || ''}`.trim() : 'Unassigned';
      byClass[key] = byClass[key] || { className: key, students: 0, expected: 0, collected: 0 };
      byClass[key].students++;
      byClass[key].expected += inv.total || 0;
      byClass[key].collected += inv.paidTotal || 0;
      (inv.items || []).forEach(it => {
        byFeeType[it.feeType] = byFeeType[it.feeType] || { feeType: it.feeType, expected: 0, collected: 0 };
        byFeeType[it.feeType].expected += it.amount || 0;
      });
    });
    payments.forEach(p => {
      const ft = p.feeType || 'School Fees';
      byFeeType[ft] = byFeeType[ft] || { feeType: ft, expected: 0, collected: 0 };
      byFeeType[ft].collected += p.amount || 0;
    });

    const classRows = Object.values(byClass).map(x => ({
      ...x,
      balance: x.expected - x.collected,
      rate: x.expected ? Math.round((x.collected / x.expected) * 100) : 0
    })).sort((a, b) => b.balance - a.balance);

    const feeTypeRows = Object.values(byFeeType).map(x => ({
      ...x,
      balance: x.expected - x.collected,
      rate: x.expected ? Math.round((x.collected / x.expected) * 100) : 0
    }));

    const arrears = invoices
      .map(inv => ({ student: inv.studentId, invoice: inv, balance: (inv.total || 0) - (inv.paidTotal || 0) }))
      .filter(x => x.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 10);

    const monthLabels = [];
    const now = new Date();
    for (let m = 5; m >= 0; m--) {
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      monthLabels.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-RW', { month: 'short' }) });
    }
    const trendMap = {};
    payments.forEach(p => {
      const d = new Date(p.paymentDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      trendMap[key] = trendMap[key] || { amount: 0, count: 0 };
      trendMap[key].amount += p.amount || 0;
      trendMap[key].count++;
    });
    const monthlyTrend = monthLabels.map(({ key, label }) => ({ label, amount: trendMap[key]?.amount || 0, count: trendMap[key]?.count || 0 }));

    const statusCount = { paid: 0, partial: 0, issued: 0, draft: 0, overdue: 0 };
    invoices.forEach(inv => { statusCount[resolveInvoiceStatus(inv)]++; });

    res.json({
      success: true,
      year,
      summary: {
        totalExpected,
        totalCollected,
        balance: totalExpected - totalCollected,
        collectionRate: totalExpected ? Math.round((totalCollected / totalExpected) * 100) : 0,
        totalInvoices: invoices.length,
        ...statusCount
      },
      byClass: classRows,
      byFeeType: feeTypeRows,
      arrears,
      monthlyTrend
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== SALARIES ====================
router.get('/accounts/salaries', authMiddleware, requireRole('accounts_admin', 'super_admin'), async (req, res) => {
  const salaries = await Salary.find().sort({ createdAt: -1 });
  res.json(salaries);
});

router.post('/accounts/salaries', authMiddleware, requireRole('accounts_admin', 'super_admin'), async (req, res) => {
  try {
    const salary = await Salary.create(req.body);
    res.json({ success: true, salary });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/accounts/salaries/:id/approve', authMiddleware, requireRole('accounts_admin', 'super_admin'), async (req, res) => {
  try {
    const salary = await Salary.findByIdAndUpdate(
      req.params.id,
      { status: 'approved', approvedBy: req.userId, approvedAt: new Date() },
      { new: true }
    );
    res.json({ success: true, salary });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== BUDGET / INCOME / EXPENSES ====================
router.get('/accounts/budget', authMiddleware, requireRole('accounts_admin', 'super_admin'), async (req, res) => {
  let budget = await Budget.findOne().sort({ updatedAt: -1 });
  if (!budget) budget = { total: 0 };
  res.json(budget);
});

router.put('/accounts/budget', authMiddleware, requireRole('accounts_admin', 'super_admin'), async (req, res) => {
  try {
    let budget = await Budget.findOne();
    if (budget) {
      budget.total = req.body.total; budget.updatedBy = req.userId; budget.updatedAt = new Date();
      await budget.save();
    } else {
      budget = await Budget.create({ total: req.body.total, updatedBy: req.userId });
    }
    res.json({ success: true, budget });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/accounts/income', authMiddleware, requireRole('accounts_admin', 'super_admin'), async (req, res) => {
  const income = await Income.find().sort({ date: -1 });
  res.json(income);
});

router.post('/accounts/income', authMiddleware, requireRole('accounts_admin', 'super_admin'), async (req, res) => {
  try {
    const income = await Income.create({ ...req.body, recordedBy: req.userId, date: req.body.date || new Date() });
    res.json({ success: true, income });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/accounts/expenses', authMiddleware, requireRole('accounts_admin', 'super_admin'), async (req, res) => {
  const expenses = await Expense.find().sort({ date: -1 });
  res.json(expenses);
});

router.post('/accounts/expenses', authMiddleware, requireRole('accounts_admin', 'super_admin'), async (req, res) => {
  try {
    const expense = await Expense.create({ ...req.body, recordedBy: req.userId, date: req.body.date || new Date() });
    res.json({ success: true, expense });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/accounts/financial-summary', authMiddleware, requireRole('accounts_admin', 'super_admin'), async (req, res) => {
  try {
    const [incomeAgg, expenseAgg, pendingSalaries, completedPayments] = await Promise.all([
      Income.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
      Expense.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
      Salary.countDocuments({ status: 'pending' }),
      FeePayment.countDocuments({ status: 'completed' })
    ]);
    const totalIncome   = incomeAgg[0]?.total || 0;
    const totalExpenses = expenseAgg[0]?.total || 0;
    res.json({ success: true, totalIncome, totalExpenses, netBalance: totalIncome - totalExpenses, pendingSalaries, completedPayments });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;