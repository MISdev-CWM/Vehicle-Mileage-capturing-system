const express = require('express');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { usernameFromEmployeeId, usernameFromVehicleNumber } = require('../utils/usernames');

const router = express.Router();

router.use(authenticate, authorizeRoles('admin'));

const toDateOrNull = (value) => value ? new Date(value) : null;

const normalizeVehicleInput = (body) => ({
  vehicleNumber: body.vehicleNumber?.trim().toUpperCase(),
  make: body.make?.trim(),
  name: body.name?.trim(),
  model: body.model?.trim(),
  engineCapacity: body.engineCapacity?.trim(),
  manufacturingYear: body.manufacturingYear ? Number(body.manufacturingYear) : null,
  status: body.status === 'inactive' ? 'inactive' : 'active',
  ownership: body.ownership === 'personal' ? 'personal' : 'company',
  allocatedUser: body.ownership === 'personal' ? (body.allocatedUser || null) : null,
  allocatedDrivers: body.ownership === 'personal' ? [] : (Array.isArray(body.allocatedDrivers) ? body.allocatedDrivers.filter(Boolean) : []),
  dateOfPurchasing: toDateOrNull(body.dateOfPurchasing),
  dateOfUserAllocation: toDateOrNull(body.dateOfUserAllocation)
});

const validateVehicle = async (payload, validateAllocation = true, validateGeneratedUsername = true) => {
  if (!payload.vehicleNumber || !payload.make || !payload.name || !payload.model || !payload.engineCapacity || !payload.manufacturingYear) {
    return 'Vehicle number, make, name, model, engine capacity, and manufacturing year are required';
  }

  if (payload.manufacturingYear < 1900 || payload.manufacturingYear > 2100) {
    return 'Please enter a valid manufacturing year';
  }

  if (!validateAllocation) {
    return null;
  }

  if (payload.ownership === 'personal' && payload.allocatedUser) {
    const user = await User.findById(payload.allocatedUser).select('role isActive');

    if (!user || !user.isActive || user.role !== 'user') {
      return 'Allocated user must be an active user-role account';
    }

    if (validateGeneratedUsername) {
      const generatedUsername = usernameFromVehicleNumber(payload.vehicleNumber);

      if (!generatedUsername) {
        return 'Vehicle number must contain at least one letter or number';
      }

      const usernameOwner = await User.findOne({
        username: generatedUsername,
        _id: { $ne: payload.allocatedUser }
      }).select('_id');

      if (usernameOwner) {
        return `Generated username "${generatedUsername}" is already used by another account`;
      }
    }
  }

  if (payload.ownership === 'company' && payload.allocatedDrivers.length > 0) {
    const drivers = await User.find({
      _id: { $in: payload.allocatedDrivers },
      role: 'driver',
      isActive: true
    }).select('_id');

    if (drivers.length !== payload.allocatedDrivers.length) {
      return 'Allocated drivers must be active driver-role accounts';
    }
  }

  return null;
};

const allocationEntries = (ownership, allocatedUser, allocatedDrivers, assignedAt) => {
  if (ownership === 'personal') {
    return allocatedUser
      ? [{ user: allocatedUser, allocationType: 'user', assignedAt }]
      : [];
  }

  return allocatedDrivers.map(user => ({ user, allocationType: 'driver', assignedAt }));
};

const sameId = (left, right) => left?.toString() === right?.toString();

const syncUserVehicleAssignment = async (oldUserId, newUserId, vehicleNumber) => {
  if (oldUserId && oldUserId.toString() !== newUserId?.toString()) {
    const oldUser = await User.findById(oldUserId).select('employeeId');
    await User.findByIdAndUpdate(oldUserId, {
      $set: {
        vehicleId: '',
        username: usernameFromEmployeeId(oldUser?.employeeId || oldUserId)
      }
    }, { runValidators: true });
  }

  if (newUserId) {
    await User.findByIdAndUpdate(newUserId, {
      $set: {
        vehicleId: vehicleNumber,
        username: usernameFromVehicleNumber(vehicleNumber)
      }
    }, { runValidators: true });
  }
};

const populateVehicle = (query) => query
  .populate('allocatedUser', 'name username employeeId role email')
  .populate('allocatedDrivers', 'name username employeeId role contactNumber')
  .populate('allocationHistory.user', 'name username employeeId role');

router.get('/', async (req, res) => {
  try {
    const search = req.query.search?.trim();
    const filter = search
      ? {
          $or: [
            { vehicleNumber: new RegExp(search, 'i') },
            { make: new RegExp(search, 'i') },
            { name: new RegExp(search, 'i') },
            { model: new RegExp(search, 'i') },
            { engineCapacity: new RegExp(search, 'i') },
            { status: new RegExp(search, 'i') },
            { ownership: new RegExp(search, 'i') }
          ]
        }
      : {};

    const vehicles = await populateVehicle(
      Vehicle.find(filter).sort({ createdAt: -1 }).select('-__v')
    );

    res.json(vehicles);
  } catch (error) {
    console.error('Vehicle list error:', error);
    res.status(500).json({ error: 'Failed to load vehicles' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const vehicle = await populateVehicle(Vehicle.findById(req.params.id).select('-__v'));

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    res.json(vehicle);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load vehicle' });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload = normalizeVehicleInput(req.body);
    const validationError = await validateVehicle(payload);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const hasAllocation = payload.allocatedUser || payload.allocatedDrivers.length > 0;

    if (hasAllocation && !payload.dateOfUserAllocation) {
      payload.dateOfUserAllocation = new Date();
    }

    payload.allocationHistory = allocationEntries(
      payload.ownership,
      payload.allocatedUser,
      payload.allocatedDrivers,
      payload.dateOfUserAllocation || new Date()
    );

    const vehicle = await Vehicle.create(payload);
    await syncUserVehicleAssignment(null, vehicle.allocatedUser, vehicle.vehicleNumber);

    const populated = await populateVehicle(Vehicle.findById(vehicle._id).select('-__v'));
    res.status(201).json(populated);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Vehicle number already exists' });
    }

    console.error('Vehicle create error:', error);
    res.status(500).json({ error: 'Failed to create vehicle' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existingVehicle = await Vehicle.findById(req.params.id);

    if (!existingVehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const payload = normalizeVehicleInput(req.body);
    payload.ownership = existingVehicle.ownership;
    payload.allocatedUser = existingVehicle.allocatedUser;
    payload.allocatedDrivers = existingVehicle.allocatedDrivers;
    payload.dateOfUserAllocation = existingVehicle.dateOfUserAllocation;

    const validationError = await validateVehicle(payload, false);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const vehicle = await Vehicle.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true }
    ).select('-__v');

    await syncUserVehicleAssignment(existingVehicle.allocatedUser, vehicle.allocatedUser, vehicle.vehicleNumber);

    const populated = await populateVehicle(Vehicle.findById(vehicle._id).select('-__v'));
    res.json(populated);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Vehicle number already exists' });
    }

    console.error('Vehicle update error:', error);
    res.status(500).json({ error: 'Failed to update vehicle' });
  }
});

router.patch('/:id/assignment', async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const payload = {
      ownership: vehicle.ownership,
      allocatedUser: vehicle.ownership === 'personal' ? (req.body.allocatedUser || null) : null,
      allocatedDrivers: vehicle.ownership === 'company'
        ? [...new Set(Array.isArray(req.body.allocatedDrivers) ? req.body.allocatedDrivers.filter(Boolean) : [])]
        : []
    };
    // The previous user is released below before the selected user's username is
    // updated.  Therefore this route must not reject the current user's vehicle
    // username as a collision before the reassignment can take place.
    const validationError = await validateVehicle({
      ...vehicle.toObject(),
      ...payload
    }, true, false);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    let previouslyAssignedVehicle = null;

    if (vehicle.ownership === 'personal' && payload.allocatedUser) {
      previouslyAssignedVehicle = await Vehicle.findOne({
        _id: { $ne: vehicle._id },
        ownership: 'personal',
        allocatedUser: payload.allocatedUser
      }).select('vehicleNumber make name allocatedUser allocationHistory dateOfUserAllocation');

      if (previouslyAssignedVehicle && req.body.confirmReassignment !== true) {
        return res.status(409).json({
          code: 'USER_ALREADY_ASSIGNED',
          error: 'This user is already assigned to another vehicle',
          currentVehicle: {
            _id: previouslyAssignedVehicle._id,
            vehicleNumber: previouslyAssignedVehicle.vehicleNumber,
            make: previouslyAssignedVehicle.make,
            name: previouslyAssignedVehicle.name
          }
        });
      }

      const generatedUsername = usernameFromVehicleNumber(vehicle.vehicleNumber);
      const currentUserId = vehicle.allocatedUser;
      const usernameOwner = generatedUsername
        ? await User.findOne({
            username: generatedUsername,
            _id: { $nin: [payload.allocatedUser, currentUserId].filter(Boolean) }
          }).select('_id')
        : null;

      if (usernameOwner) {
        return res.status(409).json({
          error: `Generated username "${generatedUsername}" is already used by another account`
        });
      }
    }

    const currentEntries = allocationEntries(
      vehicle.ownership,
      vehicle.allocatedUser,
      vehicle.allocatedDrivers,
      null
    );
    const nextEntries = allocationEntries(
      payload.ownership,
      payload.allocatedUser,
      payload.allocatedDrivers,
      null
    );
    const hasChanged = currentEntries.length !== nextEntries.length || currentEntries.some(current => !nextEntries.some(next => (
      current.allocationType === next.allocationType && sameId(current.user, next.user)
    )));

    if (!hasChanged) {
      const populated = await populateVehicle(Vehicle.findById(vehicle._id).select('-__v'));
      return res.json(populated);
    }

    const assignedAt = new Date();
    const removedEntries = currentEntries.filter(current => !nextEntries.some(next => (
      current.allocationType === next.allocationType && sameId(current.user, next.user)
    )));
    const addedEntries = nextEntries.filter(next => !currentEntries.some(current => (
      current.allocationType === next.allocationType && sameId(current.user, next.user)
    )));

    vehicle.allocationHistory.forEach(entry => {
      const isRemoved = removedEntries.some(removed => (
        removed.allocationType === entry.allocationType && sameId(removed.user, entry.user)
      ));

      if (isRemoved && !entry.unassignedAt) {
        entry.unassignedAt = assignedAt;
      }
    });
    vehicle.allocationHistory.push(...addedEntries.map(entry => ({ ...entry, assignedAt })));
    vehicle.allocatedUser = payload.allocatedUser;
    vehicle.allocatedDrivers = payload.allocatedDrivers;
    vehicle.dateOfUserAllocation = nextEntries.length ? assignedAt : null;

    if (previouslyAssignedVehicle) {
      previouslyAssignedVehicle.allocationHistory.forEach(entry => {
        if (
          entry.allocationType === 'user'
          && sameId(entry.user, payload.allocatedUser)
          && !entry.unassignedAt
        ) {
          entry.unassignedAt = assignedAt;
        }
      });
      previouslyAssignedVehicle.allocatedUser = null;
      previouslyAssignedVehicle.dateOfUserAllocation = null;
      await previouslyAssignedVehicle.save();
    }

    await vehicle.save();

    await syncUserVehicleAssignment(
      vehicle.ownership === 'personal' ? currentEntries[0]?.user : null,
      vehicle.ownership === 'personal' ? payload.allocatedUser : null,
      vehicle.vehicleNumber
    );

    const populated = await populateVehicle(Vehicle.findById(vehicle._id).select('-__v'));
    res.json(populated);
  } catch (error) {
    console.error('Vehicle assignment change error:', error);
    res.status(500).json({ error: 'Failed to change vehicle user' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const vehicle = await Vehicle.findByIdAndDelete(req.params.id);

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    await syncUserVehicleAssignment(vehicle.allocatedUser, null, vehicle.vehicleNumber);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete vehicle' });
  }
});

module.exports = router;
