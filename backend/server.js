require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const User = require('./models/User');
const { hashPassword } = require('./utils/password');

const app = express();

const allowedOrigins = new Set([
  'https://vehicle-mileage-capturing-system.vercel.app',
  ...(process.env.CLIENT_URLS || process.env.CLIENT_URL || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
]);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origin is not allowed by CORS'));
  },
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const seedDefaultUsers = async () => {
  const defaults = [
    {
      name: process.env.DEFAULT_ADMIN_NAME || 'System Admin',
      email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@fleet.local',
      employeeId: process.env.DEFAULT_ADMIN_EMPLOYEE_ID || 'ADM-001',
      username: process.env.DEFAULT_ADMIN_USERNAME || 'admin',
      contactNumber: process.env.DEFAULT_ADMIN_CONTACT_NUMBER || '0770000001',
      password: process.env.DEFAULT_ADMIN_PASSWORD || 'admin123',
      role: 'admin',
      vehicleId: ''
    },
    {
      name: process.env.DEFAULT_USER_NAME || 'Fleet User',
      email: process.env.DEFAULT_USER_EMAIL || 'user@fleet.local',
      employeeId: process.env.DEFAULT_USER_EMPLOYEE_ID || 'EMP-001',
      username: process.env.DEFAULT_USER_USERNAME || 'employee',
      contactNumber: process.env.DEFAULT_USER_CONTACT_NUMBER || '0770000002',
      password: process.env.DEFAULT_USER_PASSWORD || 'user123',
      role: 'user',
      vehicleId: process.env.DEFAULT_USER_VEHICLE_ID || 'VH-2024-001'
    }
  ];

  for (const user of defaults) {
    const existingUser = await User.findOne({ email: user.email });

    if (existingUser) {
      existingUser.employeeId = existingUser.employeeId || user.employeeId;
      existingUser.username = existingUser.username || user.username;
      existingUser.contactNumber = existingUser.contactNumber || user.contactNumber;
      existingUser.vehicleId = existingUser.vehicleId || user.vehicleId;
      if (user.role === 'user' && existingUser.role !== 'admin') {
        existingUser.role = 'user';
      }
      await existingUser.save();
      continue;
    }

    const { hash, salt } = hashPassword(user.password);

    await User.create({
      name: user.name,
      email: user.email,
      employeeId: user.employeeId,
      username: user.username,
      contactNumber: user.contactNumber,
      role: user.role,
      vehicleId: user.vehicleId,
      passwordHash: hash,
      passwordSalt: salt
    });
  }

  console.log('Default users ready: admin@fleet.local / admin123, user@fleet.local / user123');
};

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vehicle-mileage')
  .then(async () => {
    console.log('MongoDB connected');
    await seedDefaultUsers();
  })
  .catch(err => console.error('MongoDB error:', err));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/users', require('./routes/users'));
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/company-drivers', require('./routes/companyDrivers'));
app.use('/api/readings', require('./routes/readings'));

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    ocrService: process.env.OCR_SERVICE_URL || 'http://localhost:8000',
    imageStorage: 'disabled (memory-only)'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server on port ${PORT}`));
