import crypto from 'crypto';
import pool from '../config/database.js';
import { logger } from './logger.js';

/**
 * Generate content hash for caching
 */
export const generateContentHash = (content) => {
  if (!content) return null;
  return crypto.createHash('sha256').update(content).digest('hex');
};

/**
 * Normalize text for consistent hashing
 */
export const normalizeText = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '');
};

/**
 * Get hash for analyze cache key
 */
export const getAnalyzeCacheKey = (jobDescription, masterResumeText) => {
  const normalizedJD = normalizeText(jobDescription);
  const normalizedResume = normalizeText(masterResumeText);
  const combined = `${normalizedJD}|${normalizedResume}`;
  return generateContentHash(combined);
};

/**
 * Check if analysis is cached
 */
export const getAnalysisFromCache = async (userId, contentHash) => {
  try {
    if (!contentHash) return null;

    const result = await pool.query(
      `SELECT analysis_json, created_at FROM analyze_cache 
       WHERE user_id = $1 AND content_hash = $2`,
      [userId, contentHash]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const cached = result.rows[0];
    const ageMinutes = (Date.now() - new Date(cached.created_at).getTime()) / 60000;

    // Invalidate if older than 30 days
    if (ageMinutes > 43200) {
      await pool.query(
        `DELETE FROM analyze_cache WHERE user_id = $1 AND content_hash = $2`,
        [userId, contentHash]
      );
      return null;
    }

    logger.info('✅ Analysis cache hit', { userId, ageMinutes: Math.round(ageMinutes) });
    return JSON.parse(cached.analysis_json);
  } catch (error) {
    logger.error('Error retrieving analysis from cache', {
      userId,
      contentHash,
      error: error.message,
    });
    return null;
  }
};

/**
 * Store analysis in cache
 */
export const storeAnalysisInCache = async (userId, contentHash, analysis) => {
  try {
    if (!contentHash) return false;

    await pool.query(
      `INSERT INTO analyze_cache (user_id, content_hash, analysis_json, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, content_hash) 
       DO UPDATE SET analysis_json = EXCLUDED.analysis_json, created_at = NOW()`,
      [userId, contentHash, JSON.stringify(analysis)]
    );

    logger.info('✅ Analysis cached', { userId, contentHash });
    return true;
  } catch (error) {
    logger.error('Error storing analysis in cache', {
      userId,
      contentHash,
      error: error.message,
    });
    return false;
  }
};

/**
 * Clear analysis cache for a user
 */
export const clearAnalysisCache = async (userId) => {
  try {
    const result = await pool.query(
      `DELETE FROM analyze_cache WHERE user_id = $1`,
      [userId]
    );

    logger.info('✅ Analysis cache cleared', { userId, rowsDeleted: result.rowCount });
    return true;
  } catch (error) {
    logger.error('Error clearing analysis cache', { userId, error: error.message });
    return false;
  }
};

/**
 * Get cache statistics
 */
export const getCacheStats = async (userId) => {
  try {
    const result = await pool.query(
      `SELECT 
        COUNT(*) as total_cached,
        SUM(LENGTH(analysis_json)) as total_bytes,
        MIN(created_at) as oldest_cache,
        MAX(created_at) as newest_cache
       FROM analyze_cache WHERE user_id = $1`,
      [userId]
    );

    return {
      total_cached: parseInt(result.rows[0].total_cached) || 0,
      total_bytes: parseInt(result.rows[0].total_bytes) || 0,
      oldest_cache: result.rows[0].oldest_cache,
      newest_cache: result.rows[0].newest_cache,
    };
  } catch (error) {
    logger.error('Error getting cache stats', { userId, error: error.message });
    return null;
  }
};

/**
 * Log cache performance
 */
export const logCacheOperation = async (userId, operation, cacheHit, contentHash = null) => {
  try {
    logger.info('CACHE_OPERATION', {
      userId,
      operation,
      cacheHit,
      contentHash: contentHash ? contentHash.substring(0, 8) : null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error logging cache operation', {
      userId,
      operation,
      error: error.message,
    });
  }
};
