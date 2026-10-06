// ==================== LOAD ENVIRONMENT VARIABLES ====================
require('dotenv').config();

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const path = require('path');

const connectDB = require('./config/database');
const { initSocket } = require('./socket');
const seedDatabase = require('./utils/seedDatabase');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./config/rateLimit');
const User = require('./models/User');

if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET is not set. Add it to your .env file.');
  process.exit(1);
}

// ==================== APP SETUP ====================
const app = express();
const server = http.createServer(app);
initSocket(server);

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api', apiLimiter);

// ==================== ROUTES ====================
app.use('/api', require('./routes/authRoutes'));
app.use('/api', require('./routes/securityRoutes'));
app.use('/api', require('./routes/healthRoutes'));
app.use('/api', require('./routes/userRoutes'));
app.use('/api', require('./routes/contactRoutes'));
app.use('/api', require('./routes/subscriptionRoutes'));
app.use('/api', require('./routes/announcementRoutes'));
app.use('/api', require('./routes/newsRoutes'));
app.use('/api', require('./routes/galleryRoutes'));
// Ahead of admissionRoutes so the richer admin endpoints match first. The
// router declares its paths as /applications/... and is mounted under the
// academic-admin prefix the frontend already calls.
app.use('/api/academic-admin', require('./routes/admissionsAdminRoutes'));
app.use('/api', require('./routes/admissionRoutes'));
app.use('/api', require('./routes/superAdminRoutes'));
app.use('/api', require('./routes/academicAdminRoutes'));
app.use('/api', require('./routes/teacherRoutes'));
app.use('/api', require('./routes/quizRoutes'));
app.use('/api', require('./routes/progressRoutes'));
app.use('/api', require('./routes/studentRoutes'));
app.use('/api', require('./routes/parentRoutes'));
app.use('/api', require('./routes/disciplineAdminRoutes'));
app.use('/api', require('./routes/permissionRoutes'));
app.use('/api', require('./routes/accountsRoutes'));
app.use('/api', require('./routes/messageRoutes'));
app.use('/api', require('./routes/conversationRoutes'));
app.use('/api', require('./routes/fileRoutes'));
app.use('/api', require('./routes/calendarRoutes'));
app.use('/api', require('./routes/subjectRoutes'));
app.use('/api', require('./routes/timetableRoutes'));
app.use('/api', require('./routes/examRoutes'));
app.use('/api', require('./routes/reportCardRoutes'));
app.use('/api', require('./routes/enrollmentRoutes'));
app.use('/api', require('./routes/lessonPlanRoutes'));
app.use('/api', require('./routes/analyticsRoutes'));
app.use('/api', require('./routes/sdmsRoutes'));

// ==================== ERROR HANDLER ====================
app.use(errorHandler);

// ==================== DATABASE CONNECTION & START ====================
const PORT = process.env.PORT || 5000;

// Without this a port clash surfaces as an unhandled 'error' event: a stack
// trace with no hint that the cause is another app already on the port.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use.`);
    console.error('   Another process is listening there. Either stop it, or set a');
    console.error(`   different PORT in backend/.env (currently ${PORT}).\n`);
  } else {
    console.error('❌ Server error:', err.message);
  }
  process.exit(1);
});

connectDB()
  .then(async () => {
    console.log('✅ MongoDB Connected');
    const userCount = await User.countDocuments();
    if (process.argv.includes('--seed') || process.env.SEED_DB === 'true' || userCount === 0) {
      await seedDatabase();
    }
    server.listen(PORT, () => {
      const target = process.env.FRONTEND_URL || 'http://localhost:5173';
      console.log(`\n🚀 API      http://localhost:${PORT}`);
      console.log(`🚀 Frontend ${target}\n`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1);
  });