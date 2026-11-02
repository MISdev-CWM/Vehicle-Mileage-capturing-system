const express = require('express');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { hashPassword } = require('../utils/password');

const router = express.Router();

router.use(authenticate, authorizeRoles('admin'));

const toPublicUser = (user, assignedVehicles = []) => ({
  id: user._id,
  _id: user._id,
  name: user.name,
  email: user.email,
  employeeId: user.employeeId || '',
  username: user.username,
  contactNumber: user.contactNumber || '',
  role: user.role,
  vehicleId: user.vehicleId || '',
  assignedVehicles,
  isActive: user.isActive,
  createdAt: user.createdAt
});

const normalizeUserInput = (body, existingUser = null) => {
  const role = ['admin', 'driver'].includes(body.role) ? body.role : 'user';
  const employeeId = body.employeeId?.trim().toUpperCase() || '';
  const username = role === 'user'
    ? (existingUser?.role === 'user' ? existingUser.username : 'non')
    : body.username?.trim().toLowerCase();
  const vehicleId = role === 'user' && existingUser?.role === 'user'
    ? existingUser.vehicleId || ''
    : '';
  const email = body.email?.trim().toLowerCase();

  return {
    name: body.name?.trim(),
    email: role === 'driver' && !email ? `${username}@driver.local` : email,
    employeeId,
    username,
    contactNumber: body.contactNumber?.trim() || '',
    role,
    vehicleId,
    isActive: body.isActive !== false
  };
};

const validateUser = (payload, password, isUpdate = false) => {
  if (!payload.employeeId || !payload.name || !payload.username || !payload.contactNumber) {
    return 'Employee ID, Employee Name, Username, and Contact Number are required';
  }

  if (payload.role !== 'driver' && !payload.email) {
    return 'Email is required';
  }

  if (!isUpdate && !password) {
    return 'Password is required';
  }

  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return 'Please enter a valid email address';
  }

  if (!/^[a-z0-9._-]+$/i.test(payload.username)) {
    return 'Username can only contain letters, numbers, dots, underscores, and hyphens';
  }

  if (payload.role !== 'user' && payload.username === 'non') {
    return 'The username "non" is reserved for unassigned users';
  }

  if (password && password.length < 6) {
    return 'Password must be at least 6 characters';
  }

  return null;
};

const usernameExists = (username, excludedUserId = null) => {
  if (username === 'non') {
    return false;
  }

  const filter = { username };
  if (excludedUserId) {
    filter._id = { $ne: excludedUserId };
  }

  return User.exists(filter);
};

router.get('/', async (req, res) => {
  try {
    const search = req.query.search?.trim();
    const filter = search
      ? {
          $or: [
            { name: new RegExp(search, 'i') },
            { email: new RegExp(search, 'i') },
            { employeeId: new RegExp(search, 'i') },
            { username: new RegExp(search, 'i') },
            { contactNumber: new RegExp(search, 'i') },
            { role: new RegExp(search, 'i') }
          ]
        }
      : {};

    if (req.query.assignable === 'true') {
      filter.role = 'user';
      filter.isActive = true;
    }

    if (req.query.poolAssignable === 'true') {
      filter.role = { $ne: 'admin' };
      filter.isActive = true;
    }

    if (['admin', 'user', 'driver'].includes(req.query.role)) {
      filter.role = req.query.role;
    }

    if (req.query.active === 'true') {
      filter.isActive = true;
    }

    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .select('name email employeeId username contactNumber role vehicleId isActive createdAt');

    const userIds = users.map(user => user._id);
    const vehicles = await Vehicle.find({
      $or: [
        { allocatedUser: { $in: userIds } },
        { allocatedDrivers: { $in: userIds } }
      ]
    }).select('vehicleNumber allocatedUser allocatedDrivers');

    const vehicleMap = new Map();
    users.forEach(user => vehicleMap.set(user._id.toString(), []));

    vehicles.forEach(vehicle => {
      if (vehicle.allocatedUser) {
        const userId = vehicle.allocatedUser.toString();
        vehicleMap.get(userId)?.push(vehicle.vehicleNumber);
      }

      vehicle.allocatedDrivers.forEach(driverId => {
        vehicleMap.get(driverId.toString())?.push(vehicle.vehicleNumber);
      });
    });

    const usersWithVehicles = users.map(user => {
      const assignedVehicles = [...new Set(vehicleMap.get(user._id.toString()) || [])].sort();
      return toPublicUser(user, assignedVehicles);
    });

    res.json(usersWithVehicles);
  } catch (error) {
    console.error('User list error:', error);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload = normalizeUserInput(req.body);
    const validationError = validateUser(payload, req.body.password);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    if (await usernameExists(payload.username)) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const { hash, salt } = hashPassword(req.body.password);
    const user = await User.create({
      ...payload,
      passwordHash: hash,
      passwordSalt: salt
    });

    res.status(201).json(toPublicUser(user));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Email, Username, or Employee ID already exists' });
    }

    console.error('User create error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existingUser = await User.findById(req.params.id)
      .select('role username vehicleId');

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const payload = normalizeUserInput(req.body, existingUser);
    const validationError = validateUser(payload, req.body.password, true);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    if (await usernameExists(payload.username, existingUser._id)) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const update = { ...payload };

    if (req.body.password) {
      const { hash, salt } = hashPassword(req.body.password);
      update.passwordHash = hash;
      update.passwordSalt = salt;
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    ).select('name email employeeId username contactNumber role vehicleId isActive createdAt');

    res.json(toPublicUser(user));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Email, Username, or Employee ID already exists' });
    }

    console.error('User update error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
