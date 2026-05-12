/**
 * Usage Stats Routes
 * 
 * Endpoints for retrieving LLM usage statistics and costs
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getUserUsageStats,
  getUsageByPhase,
  getUsageByModel,
  getTotalCost,
  getRecentUsage
} = require('../services/tokenTrackingService');

/**
 * GET /api/v2/usage/stats
 * Get comprehensive usage statistics for the user
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { phase, startDate, endDate } = req.query;

    console.log(`📊 Fetching usage stats for user ${userId}`);

    const options = {};
    if (phase) options.phase = phase;
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);

    const stats = await getUserUsageStats(userId, options);

    console.log('✅ Usage stats retrieved');

    res.status(200).json({
      status: 'success',
      data: stats
    });
  } catch (error) {
    console.error('❌ Failed to get usage stats:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve usage statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/v2/usage/by-phase
 * Get usage statistics grouped by phase
 */
router.get('/by-phase', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    console.log(`📊 Fetching usage by phase for user ${userId}`);

    const stats = await getUsageByPhase(userId);

    console.log('✅ Usage by phase retrieved');

    res.status(200).json({
      status: 'success',
      data: {
        user_id: userId,
        by_phase: stats,
        total_cost_usd: stats.reduce((sum, row) => sum + row.total_cost_usd, 0)
      }
    });
  } catch (error) {
    console.error('❌ Failed to get usage by phase:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve usage by phase',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/v2/usage/by-model
 * Get usage statistics grouped by model
 */
router.get('/by-model', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    console.log(`📊 Fetching usage by model for user ${userId}`);

    const stats = await getUsageByModel(userId);

    console.log('✅ Usage by model retrieved');

    res.status(200).json({
      status: 'success',
      data: {
        user_id: userId,
        by_model: stats,
        total_cost_usd: stats.reduce((sum, row) => sum + row.total_cost_usd, 0)
      }
    });
  } catch (error) {
    console.error('❌ Failed to get usage by model:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve usage by model',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/v2/usage/total-cost
 * Get total cost for the user
 */
router.get('/total-cost', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    console.log(`💰 Fetching total cost for user ${userId}`);

    const totalCost = await getTotalCost(userId);

    console.log(`✅ Total cost retrieved: $${totalCost.toFixed(2)}`);

    res.status(200).json({
      status: 'success',
      data: {
        user_id: userId,
        total_cost_usd: totalCost
      }
    });
  } catch (error) {
    console.error('❌ Failed to get total cost:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve total cost',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/v2/usage/recent
 * Get recent LLM usage (last N calls)
 */
router.get('/recent', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;

    if (limit < 1 || limit > 100) {
      return res.status(400).json({
        status: 'error',
        message: 'Limit must be between 1 and 100'
      });
    }

    console.log(`📊 Fetching recent usage for user ${userId} (limit: ${limit})`);

    const recentUsage = await getRecentUsage(userId, limit);

    console.log('✅ Recent usage retrieved');

    res.status(200).json({
      status: 'success',
      data: {
        user_id: userId,
        limit,
        count: recentUsage.length,
        recent_usage: recentUsage
      }
    });
  } catch (error) {
    console.error('❌ Failed to get recent usage:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve recent usage',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
