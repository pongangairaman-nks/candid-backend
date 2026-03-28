import express from 'express';
import pool from '../config/database.js';
import { optimizeSectionWithClaude } from '../services/claudeService.js';
import { optimizeSectionWithGemini } from '../services/geminiService.js';
import { optimizeSectionWithOpenAI } from '../services/openaiService.js';
import { authenticateToken } from '../middleware/auth.js';
import { getUserLLMConfig } from './llmConfig.js';
import { getTieredLLMConfig } from '../services/llmTierService.js';
import { getUserFeatureFlags } from '../services/featureFlags.js';
import { logLLMOperation, logger } from '../services/logger.js';
import { optimizeLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// POST /api/resume/save-master-template - Save master resume template
router.post('/save-master-template', authenticateToken, async (req, res) => {
  try {
    const { latexCode } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!latexCode || !latexCode.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'LaTeX code is required',
      });
    }

    // Check if user already has a master template
    const existingTemplate = await pool.query(
      'SELECT id FROM resumes WHERE user_id = $1 AND id = (SELECT MIN(id) FROM resumes WHERE user_id = $1)',
      [userId]
    );

    let result;
    if (existingTemplate.rows?.length > 0) {
      // Update existing master template
      result = await pool.query(
        `UPDATE resumes 
         SET original_latex = $1, master_resume_text = $2, updated_at = NOW()
         WHERE user_id = $3 AND id = $4
         RETURNING id, original_latex, updated_at`,
        [latexCode, latexCode, userId, existingTemplate.rows?.[0]?.id]
      );
    } else {
      // Create new master template
      result = await pool.query(
        `INSERT INTO resumes (user_id, original_latex, master_resume_text, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         RETURNING id, original_latex, created_at`,
        [userId, latexCode, latexCode]
      );
    }

    if (result.rows?.length === 0) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to save master template',
      });
    }

    const template = result.rows?.[0];

    res.status(200).json({
      status: 'success',
      message: 'Master template saved successfully',
      data: {
        templateId: template.id,
        savedAt: template.updated_at || template.created_at,
      },
    });
  } catch (error) {
    console.error('Save master template error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to save master template',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// GET /api/resume/master-template - Get master resume template
router.get('/master-template', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    console.log(`📄 Fetching master template for user ${userId}`);

    const result = await pool.query(
      `SELECT id, original_latex, created_at, updated_at 
       FROM resumes 
       WHERE user_id = $1 
       ORDER BY id ASC 
       LIMIT 1`,
      [userId]
    );

    if (result.rows?.length === 0) {
      console.log(`⚠️ No master template found for user ${userId}`);
      return res.status(200).json({
        status: 'success',
        data: {
          templateId: null,
          latexCode: '',
        },
      });
    }

    const template = result.rows[0];

    console.log(`✅ Master template found for user ${userId}`);

    res.status(200).json({
      status: 'success',
      data: {
        templateId: template.id,
        latexCode: template.original_latex,
        createdAt: template.created_at,
        updatedAt: template.updated_at,
      },
    });
  } catch (error) {
    console.error('❌ Get master template error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch master template',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// POST /api/resume/save-master-cover-letter-template - Save master cover letter template
router.post('/save-master-cover-letter-template', authenticateToken, async (req, res) => {
  try {
    const { latexCode } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!latexCode || !latexCode.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'LaTeX code is required',
      });
    }

    // Check if user already has a master cover letter template
    const existingTemplate = await pool.query(
      'SELECT id FROM cover_letters WHERE user_id = $1 ORDER BY id ASC LIMIT 1',
      [userId]
    );

    let result;
    if (existingTemplate.rows?.length > 0) {
      // Update existing master cover letter template
      result = await pool.query(
        `UPDATE cover_letters 
         SET original_latex = $1, master_cover_letter_text = $2, updated_at = NOW()
         WHERE user_id = $3 AND id = $4
         RETURNING id, original_latex, updated_at`,
        [latexCode, latexCode, userId, existingTemplate.rows?.[0]?.id]
      );
    } else {
      // Create new master cover letter template
      result = await pool.query(
        `INSERT INTO cover_letters (user_id, original_latex, master_cover_letter_text, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         RETURNING id, original_latex, created_at`,
        [userId, latexCode, latexCode]
      );
    }

    if (result.rows?.length === 0) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to save master cover letter template',
      });
    }

    const template = result.rows?.[0];

    res.status(200).json({
      status: 'success',
      message: 'Master cover letter template saved successfully',
      data: {
        templateId: template.id,
        saved_at: template.updated_at || template.created_at,
      },
    });
  } catch (error) {
    console.error('Save master cover letter template error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to save master cover letter template',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// GET /api/resume/master-cover-letter-template - Get master cover letter template
router.get('/master-cover-letter-template', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    console.log(`📄 Fetching master cover letter template for user ${userId}`);

    const result = await pool.query(
      `SELECT id, original_latex, created_at, updated_at 
       FROM cover_letters 
       WHERE user_id = $1
       ORDER BY id ASC
       LIMIT 1`,
      [userId]
    );

    if (result.rows?.length === 0) {
      console.log(`⚠️ No master cover letter template found for user ${userId}, returning empty`);
      return res.status(200).json({
        status: 'success',
        data: {
          templateId: null,
          latexCode: '',
        },
      });
    }

    const template = result.rows?.[0];

    console.log(`✅ Master cover letter template found for user ${userId}`);

    res.status(200).json({
      status: 'success',
      data: {
        templateId: template.id,
        latexCode: template.original_latex,
        createdAt: template.created_at,
        updatedAt: template.updated_at,
      },
    });
  } catch (error) {
    console.error('❌ Get master cover letter template error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch master cover letter template',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// POST /api/resume/optimize - Optimize a section of resume with quality toggle
router.post('/optimize', authenticateToken, optimizeLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const startTime = Date.now();
    const { jobDescription, prompt, masterProfile, resume, quality = 'fast' } = req.body;

    // Validate input
    if (!resume || !resume.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Resume text is required',
      });
    }

    if (!jobDescription || !jobDescription.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Job description is required',
      });
    }

    // Validate quality param
    if (!['fast', 'high'].includes(quality)) {
      return res.status(400).json({
        status: 'error',
        message: 'Quality must be either "fast" or "high"',
      });
    }

    // Use default prompt if not provided
    const optimizationPrompt = prompt && prompt.trim() 
      ? prompt 
      : 'Optimize this resume section to better match the job description. Improve clarity, impact, and ATS keyword alignment while maintaining the original structure and LaTeX formatting.';

    // Get feature flags and user config
    const flags = await getUserFeatureFlags(userId);
    const userConfig = await getTieredLLMConfig(userId, 'generator', quality === 'fast' ? 'section_optimize_fast' : 'section_optimize_high');
    console.log('userConfig', userConfig);
    if (!userConfig) {
      return res.status(400).json({
        status: 'error',
        message: 'LLM configuration not found. Please configure your LLM provider in the Configuration page.',
      });
    }

    logger.info(`🔧 Using generator: ${userConfig.provider} - ${userConfig.model} (${quality} mode, tier: ${userConfig.tier})`);

    // Prepare context based on quality
    let fullLatex = resume;
    let contextSize = resume?.length || 0;

    if (quality === 'high') {
      // Full context for high quality
      fullLatex = masterProfile || resume;
      logger.info('📊 Optimizing with full resume context (high quality)...');
    } else {
      // Reduced context for fast mode
      logger.info('📊 Optimizing with reduced context (fast mode)...');
      // Add section outline only
      if (masterProfile) {
        const sections = masterProfile.match(/\\section\*?{[^}]+}/g) || [];
        const outline = sections?.join('\n') || '';
        fullLatex = `${resume}\n\n% SECTION OUTLINE:\n${outline}`;
      }
      contextSize = fullLatex?.length || 0;
    }

    let optimizedText;

    // Call appropriate LLM service based on provider
    if (userConfig.provider === 'claude') {
      optimizedText = await optimizeSectionWithClaude(
        resume,
        fullLatex,
        jobDescription,
        optimizationPrompt,
        userConfig
      );
    } else if (userConfig.provider === 'openai') {
      optimizedText = await optimizeSectionWithOpenAI(
        resume,
        fullLatex,
        jobDescription,
        optimizationPrompt,
        userConfig
      );
    } else if (userConfig.provider === 'gemini') {
      optimizedText = await optimizeSectionWithGemini(
        resume,
        fullLatex,
        jobDescription,
        optimizationPrompt,
        userConfig
      );
    } else {
      return res.status(400).json({
        status: 'error',
        message: 'Unsupported LLM provider',
      });
    }

    // Log LLM operation
    const latency = Date.now() - startTime;
    logLLMOperation({
      userId,
      phase: `section_optimize_${quality}`,
      provider: userConfig.provider,
      model: userConfig.model,
      latencyMs: latency,
      endpoint: '/api/resume/optimize',
      status: 'success',
    });

    logger.info('✅ Resume section optimized successfully');

    res.status(200).json({
      status: 'success',
      message: 'Resume optimized successfully',
      data: {
        optimizedLatex: optimizedText,
        quality,
        contextSize,
        latencyMs: latency,
      },
    });
  } catch (error) {
    logger.error('Resume optimization error:', { error: error.message });
    
    // Extract meaningful error message from different error types
    let errorMessage = 'Failed to optimize resume';
    
    if (error.message && error.message.includes('credit balance')) {
      errorMessage = 'API credit balance is too low. Please upgrade your API plan.';
    } else if (error.message && error.message.includes('401')) {
      errorMessage = 'API authentication failed. Please check your API key configuration.';
    } else if (error.message && error.message.includes('429')) {
      errorMessage = 'API rate limit exceeded. Please try again in a few moments.';
    } else if (error.message && error.message.includes('timeout')) {
      errorMessage = 'Request timed out. Please try again.';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({
      status: 'error',
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

export default router;
