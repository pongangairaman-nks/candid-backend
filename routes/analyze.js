import express from 'express';
import pool from '../config/database.js';
import { analyzeJobDescription } from '../services/geminiService.js';
import { authenticateToken } from '../middleware/auth.js';
import { getUserLLMConfig } from './llmConfig.js';
import { getTieredLLMConfig } from '../services/llmTierService.js';
import { getUserFeatureFlags } from '../services/featureFlags.js';
import { getAnalyzeCacheKey, getAnalysisFromCache, storeAnalysisInCache } from '../services/cachingService.js';
import { logLLMOperation, logger } from '../services/logger.js';
import { analyzeLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// POST /api/analyze - Analyze job description with caching and tiered models
router.post('/analyze', authenticateToken, analyzeLimiter, async (req, res) => {
    try {
        const { resumeId, jobDescription, skipCache = false } = req.body;
        const userId = req.user.id;
        const startTime = Date.now();

        // Validate input
        if (!jobDescription) {
            return res.status(400).json({
                status: 'error',
                message: 'jobDescription is required'
            });
        }

        logger.info(`📊 Analyzing job description for user ID: ${userId}`);

        // Fetch the user's first resume (master template)
        const resumeResult = await pool.query(
            'SELECT id, masterResumeText FROM resumes WHERE userId = $1 ORDER BY id ASC LIMIT 1',
            [userId]
        );

        if (resumeResult.rows?.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'No resume found for user. Please save a master template first.'
            });
        }

        const resume = resumeResult.rows[0];
        const actualResumeId = resume.id;
        const resumeText = resume.masterResumeText;

        if (!resumeText) {
            return res.status(400).json({
                status: 'error',
                message: 'Resume text not found. Please save a master template first.'
            });
        }

        // Check feature flags
        const flags = await getUserFeatureFlags(userId);
        const enableCache = flags.enableAnalyzeCache;

        // Check cache first
        let analysis = null;
        let fromCache = false;

        if (enableCache && !skipCache) {
            const cacheKey = getAnalyzeCacheKey(jobDescription, resumeText);
            analysis = await getAnalysisFromCache(userId, cacheKey);
            fromCache = !!analysis;
        }

        // If not in cache, call LLM with tiered model
        if (!analysis) {
            try {
                const userConfig = await getTieredLLMConfig(userId, 'analyzer', 'jd_analysis');
                if (!userConfig) {
                    return res.status(400).json({
                        status: 'error',
                        message: 'LLM configuration not found. Please configure your LLM provider and API key in the Configuration page.'
                    });
                }

                logger.info(`🔧 Using analyzer: ${userConfig.provider} - ${userConfig.model} (${userConfig.tier})`);
                logger.info('🤖 Calling LLM API for analysis...');

                analysis = await analyzeJobDescription(jobDescription, resumeText, userConfig);

                // Store in cache
                if (enableCache) {
                    const cacheKey = getAnalyzeCacheKey(jobDescription, resumeText);
                    await storeAnalysisInCache(userId, cacheKey, analysis);
                }

                // Log LLM operation
                const latency = Date.now() - startTime;
                logLLMOperation({
                    userId,
                    phase: 'analyze',
                    provider: userConfig.provider,
                    model: userConfig.model,
                    latencyMs: latency,
                    endpoint: '/api/analyze',
                    status: 'success',
                });
            } catch (analysisError) {
                logger.error(`❌ Analysis failed: ${analysisError.message}`);
                return res.status(500).json({
                    status: 'error',
                    message: `Failed to analyze job description: ${analysisError.message}`,
                });
            }
        }

        // Update database with analysis and job description
        await pool.query(
            `UPDATE resumes 
       SET jobDescription = $1, analysisJson = $2, updatedAt = NOW()
       WHERE id = $3`,
            [jobDescription, JSON.stringify(analysis), actualResumeId]
        );

        logger.info('✅ Analysis saved to database');

        res.status(200).json({
            status: 'success',
            message: fromCache ? 'Job description analyzed successfully (cached)' : 'Job description analyzed successfully',
            data: {
                resumeId: actualResumeId,
                cached: fromCache,
                analysis: {
                    keywords: analysis.primaryKeywords,
                    missingSkills: analysis.missingSkills,
                    roleFocus: analysis.roleFocus
                },
                stats: {
                    keywordsCount: analysis.primaryKeywords?.length || 0,
                    missingSkillsCount: analysis.missingSkills?.length || 0,
                    jdLength: jobDescription?.length || 0
                }
            }
        });

    } catch (error) {
        logger.error(`❌ Analysis error: ${error.message}`);

        res.status(500).json({
            status: 'error',
            message: 'Failed to analyze job description',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

export default router;
