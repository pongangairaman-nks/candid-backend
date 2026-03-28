import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getUserFeatureFlags,
  setUserFeatureFlag,
  getAllUserFeatureFlags,
  bulkUpdateFeatureFlags,
  clearFeatureFlagCache,
} from '../services/featureFlags.js';
import { logger } from '../services/logger.js';

const router = express.Router();

// GET /api/feature-flags - Get all feature flags for current user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const flags = await getUserFeatureFlags(userId);

    res.status(200).json({
      status: 'success',
      message: 'Feature flags retrieved successfully',
      data: flags,
    });
  } catch (error) {
    logger.error('Failed to get feature flags', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to get feature flags',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// GET /api/feature-flags/all - Get all detailed flag settings (admin view)
router.get('/all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const allFlags = await getAllUserFeatureFlags(userId);

    res.status(200).json({
      status: 'success',
      message: 'All feature flags retrieved successfully',
      data: allFlags,
    });
  } catch (error) {
    logger.error('Failed to get all feature flags', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to get all feature flags',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// PUT /api/feature-flags/:flagName - Update a specific feature flag
router.put('/:flagName', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { flagName } = req.params;
    const { flagValue, metadata = {} } = req.body;

    if (!flagName) {
      return res.status(400).json({
        status: 'error',
        message: 'Flag name is required',
      });
    }

    if (flagValue === undefined || flagValue === null) {
      return res.status(400).json({
        status: 'error',
        message: 'Flag value is required',
      });
    }

    const result = await setUserFeatureFlag(userId, flagName, flagValue, metadata);
    clearFeatureFlagCache(userId);

    logger.info('Feature flag updated', { userId, flagName, flagValue });

    res.status(200).json({
      status: 'success',
      message: `Feature flag "${flagName}" updated successfully`,
      data: result,
    });
  } catch (error) {
    logger.error('Failed to update feature flag', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to update feature flag',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// POST /api/feature-flags/bulk - Update multiple feature flags
router.post('/bulk', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { flags } = req.body;

    if (!flags || typeof flags !== 'object') {
      return res.status(400).json({
        status: 'error',
        message: 'Flags object is required',
      });
    }

    const results = await bulkUpdateFeatureFlags(userId, flags);
    clearFeatureFlagCache(userId);

    logger.info('Bulk feature flags updated', { userId, flagCount: Object.keys(flags)?.length || 0 });

    res.status(200).json({
      status: 'success',
      message: 'Feature flags updated successfully',
      data: results,
    });
  } catch (error) {
    logger.error('Failed to bulk update feature flags', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to bulk update feature flags',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

export default router;
