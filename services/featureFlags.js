import pool from '../config/database.js';
import { logFeatureFlagToggle } from './logger.js';
import logger from './logger.js';

// In-memory cache for feature flags (per-user)
const flagCache = new Map();
const CACHE_TTL = 300000; // 5 minutes

export const initializeFeatureFlagsTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS feature_flags (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        flag_name VARCHAR(100) NOT NULL,
        flag_value BOOLEAN DEFAULT true,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, flag_name)
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_feature_flags_user_id_flag_name 
      ON feature_flags(user_id, flag_name);
    `);

    logger.info('✅ Feature flags table initialized');
  } catch (error) {
    logger.error('❌ Failed to initialize feature flags table', { error: error.message });
  }
};

// Get all flags for a user with defaults
export const getUserFeatureFlags = async (user_id) => {
  try {
    const cacheKey = `flags_${user_id}`;
    const cached = flagCache.get(cacheKey);

    if (cached && cached.expires_at > Date.now()) {
      return cached.data;
    }

    const result = await pool.query(
      `SELECT flag_name, flag_value, metadata FROM feature_flags WHERE user_id = $1`,
      [user_id]
    );

    const flags = {
      // Tier controls
      analyzerTierMode: false, // false = user choice, true = force cheap
      atsMappingTierMode: false,
      sectionOptimizeQualityDefault: 'fast', // 'fast' | 'high'

      // Caching controls
      enableAnalyzeCache: true,
      enableAtsCache: true,

      // Context trimming
      enableMasterContentTrimming: true,
      contextTrimThreshold: 0.3, // keep top 30% relevant chunks

      // ATS mode
      atsDefaultMode: 'legacy', // 'legacy' | 'llm'

      // Feature availability
      enableTwoStepGenerate: false, // flag for future two-step generation
    };

    result.rows.forEach((row) => {
      if (row.flag_value === true || row.flag_value === false) {
        flags[row.flag_name] = row.flag_value;
      } else if (row.flag_value === 'fast' || row.flag_value === 'high') {
        flags[row.flag_name] = row.flag_value;
      }
    });

    flagCache.set(cacheKey, {
      data: flags,
      expires_at: Date.now() + CACHE_TTL,
    });

    return flags;
  } catch (error) {
    logger.error('Failed to get user feature flags', { user_id, error: error.message });
    // Return defaults on error
    return {
      analyzerTierMode: false,
      atsMappingTierMode: false,
      sectionOptimizeQualityDefault: 'fast',
      enableAnalyzeCache: true,
      enableAtsCache: true,
      enableMasterContentTrimming: true,
      contextTrimThreshold: 0.3,
      atsDefaultMode: 'legacy',
      enableTwoStepGenerate: false,
    };
  }
};

// Set a specific flag for a user
export const setUserFeatureFlag = async (user_id, flag_name, flag_value, metadata = {}) => {
  try {
    const result = await pool.query(
      `INSERT INTO feature_flags (user_id, flag_name, flag_value, metadata, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONlict (user_id, flag_name) 
       DO UPDATE SET flag_value = EXCLUDED.flag_value, metadata = EXCLUDED.metadata, updated_at = NOW()
       RETURNING flag_value, metadata`,
      [user_id, flag_name, flag_value, JSON.stringify(metadata)]
    );

    const oldValue = await pool.query(
      `SELECT flag_value FROM feature_flags WHERE user_id = $1 AND flag_name = $2`,
      [user_id, flag_name]
    );

    logFeatureFlagToggle(userId, flag_name, flag_value, oldValue.rows[0]?.flag_value);

    // Invalidate cache
    flagCache.delete(`flags_${userId}`);

    logger.info('✅ Feature flag updated', {
      userId,
      flag_name,
      newValue: flag_value,
    });

    return result.rows[0];
  } catch (error) {
    logger.error('❌ Failed to set feature flag', {
      userId,
      flag_name,
      error: error.message,
    });
    throw error;
  }
};

// Get all flags for a user (admin view)
export const getAllUserFeatureFlags = async (userId) => {
  try {
    const result = await pool.query(
      `SELECT flag_name, flag_value, metadata, updated_at FROM feature_flags 
       WHERE user_id = $1 ORDER BY flag_name ASC`,
      [userId]
    );
    return result.rows;
  } catch (error) {
    logger.error('Failed to get all feature flags', { userId, error: error.message });
    throw error;
  }
};

// Bulk update flags
export const bulkUpdateFeatureFlags = async (userId, flags) => {
  try {
    const results = [];
    for (const [flagName, flagValue] of Object.entries(flags)) {
      const result = await setUserFeatureFlag(userId, flagName, flagValue);
      results.push(result);
    }
    return results;
  } catch (error) {
    logger.error('Failed to bulk update feature flags', { userId, error: error.message });
    throw error;
  }
};

// Clear cache for a user
export const clearFeatureFlagCache = (userId) => {
  flagCache.delete(`flags_${userId}`);
};
