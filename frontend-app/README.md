ESSA Nyarugunga School Management System
Professional README

📖 Usage Guide
Quick Start Guide
1. Logging In
Navigate to http://localhost:5173

Enter email: admin@essa.rw

Enter password: admin123

Select role: Super Admin

Click "Sign In"

2. Creating an Academic Admin
Go to Super Admin Dashboard

Click "Create Admin"

Fill in: Name, Email, Phone

Select Role: "Academic Admin"

Click "Create"

3. Creating a Class
Login as Academic Admin

Go to "Class Management"

Fill class details:

Class Name (e.g., "S3A")

Grade (e.g., "S3")

Academic Year (e.g., "2024-2025")

Click "Create Class"

4. Adding a Teacher
Go to "Teacher Management"

Click "Add Teacher"

Fill teacher details

Click "Create Teacher"

Note the generated password

5. Assigning Teacher to Class
Go to "Class Management"

Find the class

Click "Assign Teacher"

Select teacher from dropdown

Confirm assignment

6. Creating Student Accounts
Login as Teacher

Go to "Student Management"

Click "Create Student"

Fill student and parent details

Select class

Click "Create"

7. Recording Attendance
Go to "Attendance"

Select date

Select class

Mark present/absent for each student

Click "Save Attendance"

8. Creating Assignments
Go to "Assignments"

Click "Create Assignment"

Fill title, description, due date

Select class and subject

Set total points

Publish assignment

🧪 Testing
API Testing with cURL
bash
# Health Check
curl http://localhost:5000/api/health

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@essa.rw","password":"admin123","role":"super_admin"}'

# Get all classes (with token)
curl http://localhost:5000/api/academic-admin/classes \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# Create class
curl -X POST http://localhost:5000/api/academic-admin/classes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{"className":"S3A","grade":"S3","academicYear":"2024-2025"}'
Testing Script
javascript
// test.js - Run with: node test.js
const testAPI = async () => {
  // Test Login
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@essa.rw',
      password: 'admin123',
      role: 'super_admin'
    })
  });
  
  const data = await loginRes.json();
  console.log('Login:', data.success ? '✅ Passed' : '❌ Failed');
  console.log('Token:', data.token);
  
  // Test Health
  const healthRes = await fetch('http://localhost:5000/api/health');
  console.log('Health Check:', healthRes.ok ? '✅ Passed' : '❌ Failed');
};

testAPI();
🚢 Deployment
Deploying Backend to Production
Option 1: Deploy on VPS (Ubuntu)
bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
sudo npm install -g pm2

# Clone project
git clone https://github.com/Kevin-The-Cyber-Coder/essa-nyarugunga-school.git
cd essa-nyarugunga/backend

# Install dependencies
npm install --production

# Setup environment
cat > .env << EOF
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/essa_school
JWT_SECRET=your_secure_secret_key
NODE_ENV=production
EOF

# Start with PM2
pm2 start server.js --name essa-backend
pm2 save
pm2 startup

# Setup Nginx as reverse proxy
sudo apt install nginx -y
Nginx Configuration:

nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
Option 2: Deploy on MongoDB Atlas
Create account at MongoDB Atlas

Create a cluster (free tier available)

Get connection string: mongodb+srv://username:password@cluster.mongodb.net/essa_school

Update .env with Atlas connection string

Deploying Frontend to Production
Build for Production
bash
# Build the frontend
cd frontend
npm run build

# The build will be in the 'dist' folder
Deploy to Vercel
bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
Deploy to Netlify
bash
# Install Netlify CLI
npm i -g netlify-cli

# Deploy
netlify deploy --prod --dir=dist
Docker Deployment
dockerfile
# Dockerfile for Backend
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["node", "server.js"]
dockerfile
# Dockerfile for Frontend
FROM node:22-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
yaml
# docker-compose.yml
version: '3.8'
services:
  mongodb:
    image: mongo:8
    restart: always
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db

  backend:
    build: ./backend
    restart: always    ports:
      - "5000:5000"
    depends_on:
      - mongodb
    environment:
      - MONGODB_URI=mongodb://mongodb:27017/essa_school
      - JWT_SECRET=your_secret_key

  frontend:
    build: ./frontend
    restart: always
    ports:
      - "80:80"
    depends_on:
      - backend

volumes:
  mongodb_data:
🔧 Troubleshooting
Common Issues and Solutions
Issue 1: MongoDB Connection Failed
bash
Error: MongoNetworkError: connect ECONNREFUSED 127.0.0.1:27017
Solution:

bash
# Start MongoDB service
sudo systemctl start mongod  # Linux
net start MongoDB            # Windows
brew services start mongodb  # Mac

# Check if MongoDB is running
mongod --version
Issue 2: Port Already in Use
bash
Error: listen EADDRINUSE: address already in use :::5000
Solution:

bash
# Find process using port 5000
lsof -i :5000  # Mac/Linux
netstat -ano | findstr :5000  # Windows

# Kill the process
kill -9 <PID>  # Mac/Linux
taskkill /PID <PID> /F  # Windows

# Or use different port
PORT=5001 node server.js
Issue 3: JWT Token Expired
bash
Error: TokenExpiredError: jwt expired
Solution:

javascript
// Regenerate token with longer expiry
const token = jwt.sign(
  { id: user._id, role: user.role },
  SECRET,
  { expiresIn: '30d' }  // Extended expiry
);
Issue 4: CORS Error in Browser
bash
Access to XMLHttpRequest has been blocked by CORS policy
Solution:

javascript
// In server.js, configure CORS properly
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
Issue 5: Socket.IO Connection Failed
bash
WebSocket connection to 'ws://localhost:5000/socket.io/' failed
Solution:

javascript
// Client side connection with proper config
const socket = io('http://localhost:5000', {
  transports: ['websocket', 'polling'],
  withCredentials: true
});
Debugging Commands
bash
# Check Node.js version
node --version

# Check npm packages
npm list --depth=0

# Check MongoDB connection
mongosh --eval "db.runCommand({ping: 1})"

# Check backend logs
pm2 logs essa-backend

# Test API endpoint
curl -I http://localhost:5000/api/health

# Check environment variables
printenv | grep -E "PORT|MONGODB|JWT"
🤝 Contributing
Contribution Guidelines
Fork the repository

Create a feature branch

bash
git checkout -b feature/awesome-feature
Commit changes

bash
git commit -m "Add awesome feature"
Push to branch

bash
git push origin feature/awesome-feature
Open a Pull Request

Development Workflow
bash
# Clone your fork
git clone https://github.com/Kevin-The-Cyber-Coder/essa-nyarugunga-school.git

# Add upstream remote
git remote add upstream https://github.com/Kevin-The-Cyber-Coder/essa-nyarugunga-school.git

# Create branch
git checkout -b feature-name

# Make changes and commit
git add .
git commit -m "Description of changes"

# Push to your fork
git push origin feature-name

# Sync with upstream
git fetch upstream
git merge upstream/main
Code Style
Backend: Use ESLint with Airbnb style guide

Frontend: Use Prettier for formatting

Commit Messages: Conventional commits format

bash
# Conventional commit format
type(scope): description

# Examples
feat(auth): add JWT authentication
fix(teacher): resolve class assignment bug
docs(readme): update installation guide
style(ui): improve dashboard layout
📄 License
This project is licensed under the MIT License - see below for details:

text
MIT License

Copyright (c) 2024 ESSA Nyarugunga School

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
📞 Contact
Development Team
Role	            Name                	Contact
Lead Developer	    Mukeshimana Kevin 	    kevineniyomurinzi@gmail.com
Backend Developer	Mugisha Ishaq	        mugishaishaq8@gmail.com
Frontend Developer	UI Team	                jeanvierog@gmail.com
Database Admin	    Mukeshimana Kevin	    kevineniyomurinzi@gmail.com
School Information

ESSA Nyarugunga School
Nyarugunga Sector, Kigali
Rwanda

Phone: +250 788 123 456
Email: info@essa.rw
Website: www.essa.rw
Support Channels
Technical Support: kevineniyomurinzi@gmail.com

Report Issues: https://github.com/yourusername/essa-nyarugunga/issues

Documentation: https://docs.essa.rw

Live Chat: Available on website

🙏 Acknowledgments
Thanks to all contributors and testers

Special thanks to the school administration for support

Open source community for amazing tools and libraries

📊 Project Statistics
text
├── Backend
│   ├── 25+ API Endpoints
│   ├── 12 MongoDB Models
│   ├── 8 Middleware Functions
│   └── 3,500+ Lines of Code
│
├── Frontend
│   ├── 15 React Components
│   ├── 6 Main Pages
│   ├── 4 Role-based Dashboards
│   └── 2,800+ Lines of Code
│
└── Database
    ├── 12 Collections
    ├── 45+ Fields
    └── 30+ Indexes
<div align="center"> <strong>Built with ❤️ for ESSA Nyarugunga School</strong> <br> <sub>© 2024 ESSA Nyarugunga School. All rights reserved.</sub> </div>
