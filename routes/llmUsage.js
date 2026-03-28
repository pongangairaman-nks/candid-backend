import express from 'express';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../services/logger.js';

const router = express.Router();

// GET /api/llm-usage - Get LLM usage statistics for current user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 7, endpoint } = req.query;
    const daysNum = Math.min(parseInt(days) || 7, 90);

    const query = endpoint
      ? `SELECT 
          endpoint,
          phase,
          provider,
          model,
          COUNT(*) AS "callCount",
          SUM(input_tokens) AS "totalInputTokens",
          SUM(output_tokens) AS "totalOutputTokens",
          SUM(latency_ms) AS "totalLatencyMs",
          AVG(latency_ms) AS "avgLatencyMs",
          MIN(created_at) AS "firstCall",
          MAX(created_at) AS "lastCall"
        FROM llm_usage_logs
        WHERE user_id = $1 
          AND created_at > NOW() - INTERVAL '${daysNum} days'
          AND endpoint = $2
        GROUP BY endpoint, phase, provider, model
        ORDER BY "callCount" DESC`
      : `SELECT 
          endpoint,
          phase,
          provider,
          model,
          COUNT(*) AS "callCount",
          SUM(input_tokens) AS "totalInputTokens",
          SUM(output_tokens) AS "totalOutputTokens",
          SUM(latency_ms) AS "totalLatencyMs",
          AVG(latency_ms) AS "avgLatencyMs",
          MIN(created_at) AS "firstCall",
          MAX(created_at) AS "lastCall"
        FROM llm_usage_logs
        WHERE user_id = $1 
          AND created_at > NOW() - INTERVAL '${daysNum} days'
        GROUP BY endpoint, phase, provider, model
        ORDER BY endpoint, "callCount" DESC`;

    const params = endpoint ? [userId, endpoint] : [userId];
    const result = await pool.query(query, params);

    // Aggregates
    let totalCalls = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalLatencyMs = 0;

    result.rows.forEach((row) => {
      totalCalls += row.callCount || 0;
      totalInputTokens += row.totalInputTokens || 0;
      totalOutputTokens += row.totalOutputTokens || 0;
      totalLatencyMs += row.totalLatencyMs || 0;
    });

    const estimatedCost = calculateEstimatedCost(
      totalInputTokens,
      totalOutputTokens
    );

    res.status(200).json({
      status: 'success',
      data: {
        period: `${daysNum} days`,
        totals: {
          callCount: totalCalls,
          totalInputTokens,
          totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
          totalLatencyMs,
          avgLatencyMs:
            totalCalls > 0 ? Math.round(totalLatencyMs / totalCalls) : 0,
          estimatedCost: estimatedCost.toFixed(4),
        },
        breakdown: result.rows.map((row) => ({
          endpoint: row.endpoint,
          phase: row.phase,
          provider: row.provider,
          model: row.model,
          callCount: row.callCount,
          inputTokens: row.totalInputTokens || 0,
          outputTokens: row.totalOutputTokens || 0,
          totalTokens:
            (row.totalInputTokens || 0) +
            (row.totalOutputTokens || 0),
          avgLatencyMs: row.avgLatencyMs
            ? Math.round(row.avgLatencyMs)
            : 0,
          lastCall: row.lastCall,
        })),
      },
    });
  } catch (error) {
    logger.error('Failed to get LLM usage', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to get LLM usage statistics',
      error:
        process.env.NODE_ENV === 'development'
          ? error.message
          : undefined,
    });
  }
});

// GET /api/llm-usage/summary
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 7 } = req.query;
    const daysNum = Math.min(parseInt(days) || 7, 90);

    const result = await pool.query(
      `SELECT 
        COUNT(*) AS "totalCalls",
        COUNT(DISTINCT endpoint) AS "uniqueEndpoints",
        COUNT(DISTINCT provider) AS "uniqueProviders",
        SUM(input_tokens) AS "totalInputTokens",
        SUM(output_tokens) AS "totalOutputTokens",
        AVG(latency_ms) AS "avgLatencyMs",
        MAX(created_at) AS "lastCall"
      FROM llm_usage_logs
      WHERE user_id = $1 
        AND created_at > NOW() - INTERVAL '${daysNum} days'`,
      [userId]
    );

    const row = result.rows[0];

    const totalInputTokens = row.totalInputTokens || 0;
    const totalOutputTokens = row.totalOutputTokens || 0;

    const estimatedCost = calculateEstimatedCost(
      totalInputTokens,
      totalOutputTokens
    );

    res.status(200).json({
      status: 'success',
      data: {
        period: `${daysNum} days`,
        totalCalls: row.totalCalls || 0,
        uniqueEndpoints: row.uniqueEndpoints || 0,
        uniqueProviders: row.uniqueProviders || 0,
        totalTokens: totalInputTokens + totalOutputTokens,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        avgLatencyMs: row.avgLatencyMs
          ? Math.round(row.avgLatencyMs)
          : 0,
        estimatedCost: estimatedCost.toFixed(4),
        lastCall: row.lastCall,
      },
    });
  } catch (error) {
    logger.error('Failed to get LLM usage summary', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to get LLM usage summary',
      error:
        process.env.NODE_ENV === 'development'
          ? error.message
          : undefined,
    });
  }
});

// Cost calculation
function calculateEstimatedCost(inputTokens, outputTokens) {
  const avgInputPrice = 2.5 / 1000000;
  const avgOutputPrice = 7.5 / 1000000;

  return (
    inputTokens * avgInputPrice +
    outputTokens * avgOutputPrice
  );
}

export default router;