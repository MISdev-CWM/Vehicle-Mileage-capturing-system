const express = require('express');
const Division = require('../models/Division');
const { authenticate, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, authorizeRoles('admin', 'superadmin', 'super_admin', 'super admin', 'super-admin'));

const normalizeDivisionInput = (body) => ({
  name: body.name?.trim(),
  code: body.code?.trim().toUpperCase() || '',
  description: body.description?.trim() || ''
});

const validateDivision = ({ name }) => {
  if (!name) {
    return 'Division name is required';
  }

  return null;
};

const duplicateDivisionMessage = (error) => (
  error.keyPattern?.code ? 'Division code already exists' : 'Division name already exists'
);

router.get('/', async (req, res) => {
  try {
    const search = req.query.search?.trim();
    const filter = search
      ? {
          $or: [
            { name: new RegExp(search, 'i') },
            { code: new RegExp(search, 'i') },
            { description: new RegExp(search, 'i') }
          ]
        }
      : {};

    const divisions = await Division.find(filter)
      .sort({ createdAt: -1 })
      .select('-__v');

    res.json(divisions);
  } catch (error) {
    console.error('Division list error:', error);
    res.status(500).json({ error: 'Failed to load divisions' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const division = await Division.findById(req.params.id).select('-__v');

    if (!division) {
      return res.status(404).json({ error: 'Division not found' });
    }

    res.json(division);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load division' });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload = normalizeDivisionInput(req.body);
    const validationError = validateDivision(payload);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const division = await Division.create(payload);
    res.status(201).json(division);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: duplicateDivisionMessage(error) });
    }

    console.error('Division create error:', error);
    res.status(500).json({ error: 'Failed to create division' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const payload = normalizeDivisionInput(req.body);
    const validationError = validateDivision(payload);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const division = await Division.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true }
    ).select('-__v');

    if (!division) {
      return res.status(404).json({ error: 'Division not found' });
    }

    res.json(division);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: duplicateDivisionMessage(error) });
    }

    console.error('Division update error:', error);
    res.status(500).json({ error: 'Failed to update division' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const division = await Division.findByIdAndDelete(req.params.id);

    if (!division) {
      return res.status(404).json({ error: 'Division not found' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete division' });
  }
});

module.exports = router;
