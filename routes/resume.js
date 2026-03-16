import express from 'express';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { optimizeSectionWithClaude } from '../services/claudeService.js';
import { optimizeSectionWithGemini } from '../services/geminiService.js';
import { optimizeSectionWithOpenAI } from '../services/openaiService.js';
import { getUserLLMConfig } from './llmConfig.js';

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
    if (existingTemplate.rows.length > 0) {
      // Update existing master template
      result = await pool.query(
        `UPDATE resumes 
         SET original_latex = $1, master_resume_text = $2, updated_at = NOW()
         WHERE user_id = $3 AND id = $4
         RETURNING id, original_latex, updated_at`,
        [latexCode, latexCode, userId, existingTemplate.rows[0].id]
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

    if (result.rows.length === 0) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to save master template',
      });
    }

    const template = result.rows[0];

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

    const result = await pool.query(
      `SELECT id, original_latex, created_at, updated_at 
       FROM resumes 
       WHERE user_id = $1 AND id = (SELECT MIN(id) FROM resumes WHERE user_id = $1)
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'No master template found',
      });
    }

    const template = result.rows[0];

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
    console.error('Get master template error:', error.message);
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
    if (existingTemplate.rows.length > 0) {
      // Update existing master cover letter template
      result = await pool.query(
        `UPDATE cover_letters 
         SET original_latex = $1, master_cover_letter_text = $2, updated_at = NOW()
         WHERE user_id = $3 AND id = $4
         RETURNING id, original_latex, updated_at`,
        [latexCode, latexCode, userId, existingTemplate.rows[0].id]
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

    if (result.rows.length === 0) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to save master cover letter template',
      });
    }

    const template = result.rows[0];

    res.status(200).json({
      status: 'success',
      message: 'Master cover letter template saved successfully',
      data: {
        templateId: template.id,
        savedAt: template.updated_at || template.created_at,
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

    const result = await pool.query(
      `SELECT id, original_latex, created_at, updated_at 
       FROM cover_letters 
       WHERE user_id = $1
       ORDER BY id ASC
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({
        status: 'success',
        data: {
          templateId: null,
          latexCode: '',
        },
      });
    }

    const template = result.rows[0];

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
    console.error('Get master cover letter template error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch master cover letter template',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// POST /api/resume/optimize - Optimize a section of resume
router.post('/optimize', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { resumeText, masterDocument, jobDescription, prompt, fullLatexCode } = req.body;

    // Support both resumeText and masterDocument field names
    const selectedText = resumeText || masterDocument;

    // Validate input
    if (!selectedText || !selectedText.trim()) {
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

    // Use default prompt if not provided
    const optimizationPrompt = prompt && prompt.trim() 
      ? prompt 
      : 'Optimize this resume section to better match the job description. Improve clarity, impact, and ATS keyword alignment while maintaining the original structure and LaTeX formatting.';

    // Get full LaTeX code if not provided - fetch from master template
    let fullLatex = fullLatexCode;
    if (!fullLatex) {
      const masterResult = await pool.query(
        `SELECT original_latex FROM resumes WHERE user_id = $1 ORDER BY id ASC LIMIT 1`,
        [userId]
      );
      if (masterResult.rows.length > 0) {
        fullLatex = masterResult.rows[0].original_latex;
      }
    }

    // Get user's LLM configuration
    const userConfig = await getUserLLMConfig(userId, 'generator');
    if (!userConfig) {
      return res.status(400).json({
        status: 'error',
        message: 'LLM configuration not found. Please configure your LLM provider in the Configuration page.',
      });
    }

    console.log(`🔧 Using generator: ${userConfig.provider} - ${userConfig.model}`);

    let optimizedText;

    // Call appropriate LLM service based on provider
    if (userConfig.provider === 'claude') {
      optimizedText = await optimizeSectionWithClaude(
        selectedText,
        fullLatex || selectedText,
        jobDescription,
        optimizationPrompt,
        userConfig
      );
    } else if (userConfig.provider === 'openai') {
      optimizedText = await optimizeSectionWithOpenAI(
        selectedText,
        fullLatex || selectedText,
        jobDescription,
        optimizationPrompt,
        userConfig
      );
    } else if (userConfig.provider === 'gemini') {
      optimizedText = await optimizeSectionWithGemini(
        selectedText,
        fullLatex || selectedText,
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

    console.log('✅ Section optimized successfully');

    res.status(200).json({
      status: 'success',
      message: 'Section optimized successfully',
      data: {
        optimizedLatex: optimizedText,
      },
    });
  } catch (error) {
    console.error('Resume optimization error:', error.message);
    
    // Extract meaningful error message from different error types
    let errorMessage = 'Failed to optimize resume section';
    
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
