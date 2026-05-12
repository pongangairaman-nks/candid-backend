/**
 * Token Tracking Service
 * 
 * Handles:
 * 1. Logging every LLM call with token usage
 * 2. Calculating costs based on model pricing
 * 3. Aggregating usage statistics
 * 4. Providing usage insights
 */

const pool = require('../db');

/**
 * Model pricing (per 1M tokens)
 * Updated as of May 2026
 */
const MODEL_PRICING = {
  // Claude models
  'claude-3-5-sonnet-latest': { input: 3, output: 15 },
  'claude-opus-4-1-20250805': { input: 15, output: 75 },
  'claude-3-haiku': { input: 0.80, output: 4 },
  'claude-3-sonnet': { input: 3, output: 15 },
  'claude-3-opus': { input: 15, output: 75 },

  // OpenAI models
  'gpt-4o': { input: 5, output: 15 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },

  // Gemini models
  'gemini-2.5-flash': { input: 0.075, output: 0.30 },
  'gemini-2.5-pro': { input: 1.50, output: 6 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
  'gemini-1.5-pro': { input: 1.50, output: 6 }
};

/**
 * Log token usage for an LLM call
 * 
 * @param {Object} params - Logging parameters
 * @param {string} params.userId - User ID
 * @param {string} params.phase - Phase name (extraction, analysis, optimization, rendering)
 * @param {string} params.model - Model name
 * @param {number} params.inputTokens - Input tokens used
 * @param {number} params.outputTokens - Output tokens used
 * @returns {Promise<Object>} - Logged usage record
 */
async function logTokenUsage({
  userId,
  phase,
  model,
  inputTokens,
  outputTokens
}) {
  if (!userId) {
    throw new Error('userId is required');
  }

  if (!phase) {
    throw new Error('phase is required');
  }

  if (!model) {
    throw new Error('model is required');
  }

  if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') {
    throw new Error('inputTokens and outputTokens must be numbers');
  }

  try {
    // Calculate cost
    const costUsd = calculateCost(model, inputTokens, outputTokens);

    // Log to database
    const result = await pool.query(
      `INSERT INTO llm_usage_logs (user_id, phase, model, input_tokens, output_tokens, cost_usd, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id, user_id, phase, model, input_tokens, output_tokens, cost_usd, created_at`,
      [userId, phase, model, inputTokens, outputTokens, costUsd]
    );

    const logRecord = result.rows[0];

    console.log(`📊 Token usage logged:`);
    console.log(`   Phase: ${phase}`);
    console.log(`   Model: ${model}`);
    console.log(`   Tokens: ${inputTokens} input + ${outputTokens} output = ${inputTokens + outputTokens} total`);
    console.log(`   Cost: $${costUsd.toFixed(6)}`);

    return logRecord;
  } catch (error) {
    console.error('❌ Failed to log token usage:', error.message);
    throw error;
  }
}

/**
 * Calculate cost for token usage
 * 
 * @param {string} model - Model name
 * @param {number} inputTokens - Input tokens
 * @param {number} outputTokens - Output tokens
 * @returns {number} - Cost in USD
 */
function calculateCost(model, inputTokens, outputTokens) {
  const pricing = MODEL_PRICING[model];

  if (!pricing) {
    console.warn(`⚠️ Unknown model: ${model}. Using default pricing.`);
    return 0; // Return 0 if model not found
  }

  // Pricing is per 1M tokens, so divide by 1,000,000
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  return inputCost + outputCost;
}

/**
 * Get usage statistics for a user
 * 
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @param {string} options.phase - Filter by phase (optional)
 * @param {Date} options.startDate - Start date (optional)
 * @param {Date} options.endDate - End date (optional)
 * @returns {Promise<Object>} - Usage statistics
 */
async function getUserUsageStats(userId, options = {}) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    let query = `
      SELECT 
        phase,
        model,
        COUNT(*) as call_count,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(input_tokens + output_tokens) as total_tokens,
        SUM(cost_usd) as total_cost_usd,
        AVG(input_tokens) as avg_input_tokens,
        AVG(output_tokens) as avg_output_tokens,
        AVG(cost_usd) as avg_cost_usd,
        MIN(created_at) as first_call,
        MAX(created_at) as last_call
      FROM llm_usage_logs
      WHERE user_id = $1
    `;

    const params = [userId];
    let paramIndex = 2;

    // Add phase filter if provided
    if (options.phase) {
      query += ` AND phase = $${paramIndex}`;
      params.push(options.phase);
      paramIndex++;
    }

    // Add date range filters if provided
    if (options.startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(options.startDate);
      paramIndex++;
    }

    if (options.endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(options.endDate);
      paramIndex++;
    }

    query += ` GROUP BY phase, model ORDER BY total_cost_usd DESC`;

    const result = await pool.query(query, params);

    // Calculate totals
    const stats = result.rows;
    const totals = {
      total_calls: stats.reduce((sum, row) => sum + parseInt(row.call_count), 0),
      total_input_tokens: stats.reduce((sum, row) => sum + (parseInt(row.total_input_tokens) || 0), 0),
      total_output_tokens: stats.reduce((sum, row) => sum + (parseInt(row.total_output_tokens) || 0), 0),
      total_tokens: stats.reduce((sum, row) => sum + (parseInt(row.total_tokens) || 0), 0),
      total_cost_usd: stats.reduce((sum, row) => sum + (parseFloat(row.total_cost_usd) || 0), 0)
    };

    return {
      user_id: userId,
      period: {
        start_date: options.startDate || null,
        end_date: options.endDate || null
      },
      totals,
      by_phase_model: stats.map(row => ({
        phase: row.phase,
        model: row.model,
        call_count: parseInt(row.call_count),
        total_input_tokens: parseInt(row.total_input_tokens) || 0,
        total_output_tokens: parseInt(row.total_output_tokens) || 0,
        total_tokens: parseInt(row.total_tokens) || 0,
        total_cost_usd: parseFloat(row.total_cost_usd) || 0,
        avg_input_tokens: Math.round(parseFloat(row.avg_input_tokens) || 0),
        avg_output_tokens: Math.round(parseFloat(row.avg_output_tokens) || 0),
        avg_cost_usd: parseFloat(row.avg_cost_usd) || 0,
        first_call: row.first_call,
        last_call: row.last_call
      }))
    };
  } catch (error) {
    console.error('❌ Failed to get usage stats:', error.message);
    throw error;
  }
}

/**
 * Get usage statistics by phase
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Usage by phase
 */
async function getUsageByPhase(userId) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const result = await pool.query(
      `SELECT 
        phase,
        COUNT(*) as call_count,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(cost_usd) as total_cost_usd
      FROM llm_usage_logs
      WHERE user_id = $1
      GROUP BY phase
      ORDER BY total_cost_usd DESC`,
      [userId]
    );

    return result.rows.map(row => ({
      phase: row.phase,
      call_count: parseInt(row.call_count),
      total_input_tokens: parseInt(row.total_input_tokens) || 0,
      total_output_tokens: parseInt(row.total_output_tokens) || 0,
      total_cost_usd: parseFloat(row.total_cost_usd) || 0
    }));
  } catch (error) {
    console.error('❌ Failed to get usage by phase:', error.message);
    throw error;
  }
}

/**
 * Get usage statistics by model
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Usage by model
 */
async function getUsageByModel(userId) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const result = await pool.query(
      `SELECT 
        model,
        COUNT(*) as call_count,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(cost_usd) as total_cost_usd
      FROM llm_usage_logs
      WHERE user_id = $1
      GROUP BY model
      ORDER BY total_cost_usd DESC`,
      [userId]
    );

    return result.rows.map(row => ({
      model: row.model,
      call_count: parseInt(row.call_count),
      total_input_tokens: parseInt(row.total_input_tokens) || 0,
      total_output_tokens: parseInt(row.total_output_tokens) || 0,
      total_cost_usd: parseFloat(row.total_cost_usd) || 0
    }));
  } catch (error) {
    console.error('❌ Failed to get usage by model:', error.message);
    throw error;
  }
}

/**
 * Get total cost for a user
 * 
 * @param {string} userId - User ID
 * @returns {Promise<number>} - Total cost in USD
 */
async function getTotalCost(userId) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const result = await pool.query(
      `SELECT SUM(cost_usd) as total_cost FROM llm_usage_logs WHERE user_id = $1`,
      [userId]
    );

    return parseFloat(result.rows[0].total_cost) || 0;
  } catch (error) {
    console.error('❌ Failed to get total cost:', error.message);
    throw error;
  }
}

/**
 * Get recent usage (last N calls)
 * 
 * @param {string} userId - User ID
 * @param {number} limit - Number of records to return (default: 10)
 * @returns {Promise<Array>} - Recent usage records
 */
async function getRecentUsage(userId, limit = 10) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const result = await pool.query(
      `SELECT 
        id,
        phase,
        model,
        input_tokens,
        output_tokens,
        input_tokens + output_tokens as total_tokens,
        cost_usd,
        created_at
      FROM llm_usage_logs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      phase: row.phase,
      model: row.model,
      input_tokens: parseInt(row.input_tokens),
      output_tokens: parseInt(row.output_tokens),
      total_tokens: parseInt(row.total_tokens),
      cost_usd: parseFloat(row.cost_usd),
      created_at: row.created_at
    }));
  } catch (error) {
    console.error('❌ Failed to get recent usage:', error.message);
    throw error;
  }
}

module.exports = {
  logTokenUsage,
  calculateCost,
  getUserUsageStats,
  getUsageByPhase,
  getUsageByModel,
  getTotalCost,
  getRecentUsage,
  MODEL_PRICING
};
