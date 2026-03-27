import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import pool from '../config/database.js';
import { tailorSectionWithLLM } from '../services/sectionRefinementService.js';

const router = express.Router();

/**
 * POST /api/resume/refine-section
 * Refine a specific resume section using LLM with conversation context
 * 
 * Request body:
 * {
 *   section_key: string (e.g., "experience-0", "skills-0")
 *   section_title: string (e.g., "Professional Experience")
 *   section_content: string (current section text)
 *   job_description: string (job description for context)
 *   conversation_history: Array<{role, content}> (previous messages)
 *   user_message: string (current refinement request)
 * }
 * 
 * Response:
 * {
 *   refined_content: string (updated section content)
 *   refinement_suggestion: string (AI explanation of changes)
 *   tokens_used: number
 * }
 */
router.post('/refine-section', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const {
    section_key,
    section_title,
    section_content,
    job_description,
    conversation_history = [],
    user_message,
  } = req.body;

  // Validation
  if (!section_key || !section_title || !section_content || !user_message) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing required fields: section_key, section_title, section_content, user_message',
    });
  }

  try {
    // Fetch user's LLM configuration
    const configResult = await pool.query(
      'SELECT * FROM llm_configs WHERE user_id = $1',
      [userId]
    );

    if (configResult.rows.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'LLM configuration not found. Please configure LLM providers first.',
      });
    }

    const userConfig = configResult.rows[0];

    // Use analyzer provider for refinement (cheaper model)
    const provider = userConfig.analyzer_provider || 'openai';
    const model = userConfig.analyzer_model || 'gpt-4o-mini';
    const apiKey = userConfig.analyzer_api_key;

    if (!apiKey) {
      return res.status(400).json({
        status: 'error',
        message: `API key not configured for ${provider}`,
      });
    }

    // Call LLM service for section refinement
    const result = await tailorSectionWithLLM({
      provider,
      model,
      apiKey,
      section_key,
      section_title,
      section_content,
      job_description,
      conversation_history,
      user_message,
    });

    // Log usage
    console.log(`✅ Section refinement completed for user ${userId}`);
    console.log(`   Section: ${section_title}`);
    console.log(`   Tokens used: ${result.tokens_used || 'N/A'}`);

    res.json({
      status: 'success',
      refined_content: result.refined_content,
      refinement_suggestion: result.refinement_suggestion,
      tokens_used: result.tokens_used,
    });
  } catch (error) {
    console.error('❌ Section refinement error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to refine section',
      error: error.message,
    });
  }
});

export default router;
