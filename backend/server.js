require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

const allowedOrigins = new Set([
  'https://vehicle-mileage-capturing-system.vercel.app',
  'http://localhost:5173',
  ...(process.env.CLIENT_URLS || process.env.CLIENT_URL || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
]);

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (no Origin header) and whitelisted origins
    callback(null, !origin || allowedOrigins.has(origin));
  },
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vehicle-mileage')
  .then(() => console.log('MongoDB connected'))
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
