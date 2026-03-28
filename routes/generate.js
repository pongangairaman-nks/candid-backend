import express from 'express';
import pool from '../config/database.js';
import { tailorResumeContent } from '../services/claudeService.js';
import { tailorWithOpenAI } from '../services/openaiService.js';
import { tailorWithGemini } from '../services/geminiService.js';
import { authenticateToken } from '../middleware/auth.js';
import { getUserLLMConfig } from './llmConfig.js';
import { getUserFeatureFlags } from '../services/featureFlags.js';
import { trimMasterContentToRelevant } from '../services/contentTrimming.js';
import { logLLMOperation, logger } from '../services/logger.js';
import { generateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// POST /api/generate-resume - Generate tailored resume with content trimming
router.post('/generate-resume', authenticateToken, generateLimiter, async (req, res) => {
    try {
        const { resumeId } = req.body;
        const userId = req.user.id;
        const startTime = Date.now();

        logger.info(`📝 Generating tailored resume for user ID: ${userId}`);

        // Fetch the user's first resume (master template)
        const resumeResult = await pool.query(
            `SELECT id, original_latex, master_resume_text, job_description, analysis_json 
       FROM resumes WHERE userId = $1 ORDER BY id ASC LIMIT 1`,
            [userId]
        );

        if (resumeResult.rows?.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'No resume found for user. Please save a master template first.'
            });
        }

        const resume = resumeResult.rows?.[0];
        const actualResumeId = resume?.id;

        // Validate required data
        if (!resume?.original_latex) {
            return res.status(400).json({
                status: 'error',
                message: 'Original LaTeX template not found. Please save a master template first.'
            });
        }

        if (!resume?.job_description || !resume?.analysis_json) {
            return res.status(400).json({
                status: 'error',
                message: 'Job description analysis not found. Please run /analyze first.'
            });
        }

        let analysis = resume?.analysis_json;
        
        // Parse analysis if it's a string
        if (typeof analysis === 'string') {
            try {
                analysis = JSON.parse(analysis);
            } catch (parseError) {
                logger.error('Failed to parse analysis_json:', { error: parseError.message });
                return res.status(400).json({
                    status: 'error',
                    message: 'Invalid analysis data. Please run /analyze first.'
                });
            }
        }

        if (!analysis) {
            return res.status(400).json({
                status: 'error',
                message: 'Analysis data is empty. Please run /analyze first.'
            });
        }

        logger.info('📊 Using analysis:', {
            primary_keywords: analysis.primary_keywords?.length || analysis.keywords?.length || 0,
            missing_skills: analysis.missing_skills?.length || 0,
            role_focus: analysis.role_focus?.substring(0, 50) || 'N/A'
        });

        // Get user's LLM configuration (required) - get both generator and analyzer for fallback
        const fullConfig = await getUserLLMConfig(userId, 'both');
        if (!fullConfig || !fullConfig.generator) {
            return res.status(400).json({
                status: 'error',
                message: 'LLM configuration not found. Please configure your LLM provider and API key in the Configuration page.'
            });
        }

        // Get feature flags
        const flags = await getUserFeatureFlags(userId);
        const enableTrimming = flags.enableMasterContentTrimming;

        logger.info(`🔧 Using generator: ${fullConfig.generator.provider} - ${fullConfig.generator.model}`);

        // Trim master content if enabled
        let masterContent = fullConfig.generator.masterContent || '';
        let trimStats = null;

        if (enableTrimming && masterContent) {
            logger.info('✂️ Trimming master content to relevant chunks...');
            const trimmedContent = trimMasterContentToRelevant(
                masterContent,
                resume.job_description,
                analysis,
                { topK: 5, threshold: 0.2, maxTotalChars: 2000 }
            );
            
            trimStats = {
                originalLength: masterContent?.length || 0,
                trimmedLength: trimmedContent?.length || 0,
                reduction: `${Math.round((1 - trimmedContent?.length / masterContent?.length) * 100)}%`,
            };

            masterContent = trimmedContent;
        }

        logger.info('📊 Tailoring with optimized context...');

        // Prepare config for tailorResumeContent with both generator and analyzer info
        const userConfig = {
            provider: fullConfig.generator.provider,
            model: fullConfig.generator.model,
            apiKey: fullConfig.generator.apiKey,
            analyzer_provider: fullConfig.analyzer.provider,
            analyzer_model: fullConfig.analyzer.model,
            analyzer_api_key: fullConfig.analyzer.apiKey,
            master_content: masterContent
        };

        // Call LLM to tailor the resume
        logger.info('🤖 Calling LLM for content tailoring...');
        let tailoredLatex;
        
        if (userConfig.provider === 'openai') {
            tailoredLatex = await tailorWithOpenAI(
                resume?.original_latex,
                analysis,
                resume?.master_resume_text,
                resume?.job_description,
                userConfig
            );
        } else if (userConfig.provider === 'gemini') {
            tailoredLatex = await tailorWithGemini(
                resume?.original_latex,
                analysis,
                resume?.master_resume_text,
                resume?.job_description,
                userConfig
            );
        } else {
            tailoredLatex = await tailorResumeContent(
                resume?.original_latex,
                analysis,
                resume?.master_resume_text,
                resume?.job_description,
                userConfig
            );
        }

        // Log LLM operation
        const latency = Date.now() - startTime;
        logLLMOperation({
            userId,
            phase: 'generate_resume',
            provider: userConfig.provider,
            model: userConfig.model,
            latencyMs: latency,
            endpoint: '/api/generate-resume',
            status: 'success',
        });

        // Save tailored LaTeX to database
        await pool.query(
            `UPDATE resumes 
       SET tailored_latex = $1, updated_at = NOW()
       WHERE id = $2`,
            [tailoredLatex, actualResumeId]
        );

        logger.info('✅ Tailored resume saved to database');

        res.status(200).json({
            status: 'success',
            message: 'Resume tailored successfully',
            data: {
                resumeId: actualResumeId,
                latex: tailoredLatex,
                contentTrimming: trimStats,
                stats: {
                    originalLength: resume?.original_latex?.length || 0,
                    tailoredLength: tailoredLatex?.length || 0,
                    keywordsUsed: (analysis?.primary_keywords || analysis?.keywords || [])?.length,
                    structurePreserved: tailoredLatex?.includes('\\documentclass') || false
                }
            }
        });

    } catch (error) {
        logger.error('❌ Resume generation error:', { error: error.message });

        res.status(500).json({
            status: 'error',
            message: 'Failed to generate tailored resume',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

export default router;
