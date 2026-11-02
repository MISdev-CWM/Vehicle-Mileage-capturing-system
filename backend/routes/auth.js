const express = require('express');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const { authenticate } = require('../middleware/auth');
const { createToken } = require('../utils/token');
const { verifyPassword } = require('../utils/password');

const router = express.Router();

const toAssignedVehicle = (vehicle) => ({
  id: vehicle._id,
  vehicleNumber: vehicle.vehicleNumber,
  make: vehicle.make || '',
  name: vehicle.name || '',
  model: vehicle.model || '',
  ownership: vehicle.ownership || '',
  status: vehicle.status || ''
});

const getAssignedVehicles = async (user) => {
  if (user.role === 'driver') {
    const vehicles = await Vehicle.find({
      $or: [
        { allocatedDrivers: user._id },
        { ownership: 'pool', allocatedUser: user._id }
      ],
      status: 'active'
    })
      .sort({ vehicleNumber: 1 })
      .select('vehicleNumber make name model ownership status');

    return vehicles.map(toAssignedVehicle);
  }

  if (user.role === 'user') {
    const vehicles = await Vehicle.find({
      allocatedUser: user._id,
      status: 'active'
    })
      .sort({ vehicleNumber: 1 })
      .select('vehicleNumber make name model ownership status');

    if (vehicles.length > 0) {
      return vehicles.map(toAssignedVehicle);
    }

    if (user.vehicleId) {
      return [{
        id: user.vehicleId,
        vehicleNumber: user.vehicleId,
        make: '',
        name: '',
        model: '',
        ownership: 'personal',
        status: 'active'
      }];
    }
  }

  return [];
};

const toPublicUser = async (user) => {
  const assignedVehicles = await getAssignedVehicles(user);

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    employeeId: user.employeeId || '',
    username: user.username,
    contactNumber: user.contactNumber || '',
    role: user.role,
    vehicleId: user.vehicleId || assignedVehicles[0]?.vehicleNumber || '',
    assignedVehicles
  };
};

router.post('/login', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    const loginId = (email || username || '').toLowerCase().trim();

    if (!loginId || !password) {
      return res.status(400).json({ error: 'Username/email and password are required' });
    }

    if (loginId === 'non') {
      return res.status(401).json({ error: 'A vehicle must be assigned before using this username' });
    }

    const user = await User.findOne({
      $or: [
        { email: loginId },
        { username: loginId }
      ]
    }).select('+passwordHash +passwordSalt name email employeeId username contactNumber role vehicleId isActive');

    if (!user || !user.isActive || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.json({
      token: createToken(user),
      user: await toPublicUser(user)
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    res.json({ user: await toPublicUser(req.user) });
  } catch (error) {
    console.error('Session error:', error);
    res.status(500).json({ error: 'Failed to load session' });
  }
});

module.exports = router;
