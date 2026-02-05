import express from 'express';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Available models configuration
const AVAILABLE_MODELS = {
  claude: [
    { id: 'claude-opus-4-1-20250805', name: 'Claude Opus 4.1 (Recommended)', provider: 'claude' },
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'claude' },
    { id: 'claude-haiku-4-20250805', name: 'Claude Haiku 4', provider: 'claude' },
  ],
  gemini: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Free)', provider: 'gemini' },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', provider: 'gemini' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'gemini' },
    { id: 'gemini-3-flash', name: 'Gemini 3 Flash', provider: 'gemini' },
  ],
};

// Get available models
router.get('/models', (req, res) => {
  try {
    res.json(AVAILABLE_MODELS);
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

// Get user's LLM configuration
router.get('/config', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      'SELECT analyzer_provider, analyzer_model, analyzer_api_key, generator_provider, generator_model, generator_api_key, master_content, master_resume_prompt, master_cover_letter_prompt, is_active FROM llm_configs WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Return default config if not set
      return res.json({
        analyzer_provider: 'gemini',
        analyzer_model: 'gemini-2.5-flash',
        analyzer_api_key: null,
        generator_provider: 'claude',
        generator_model: 'claude-opus-4-1-20250805',
        generator_api_key: null,
        master_content: null,
        master_resume_prompt: null,
        master_cover_letter_prompt: null,
        is_active: true,
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching LLM config:', error);
    res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

// Save or update user's LLM configuration (POST for backward compatibility)
router.post('/config', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      analyzer_provider,
      analyzer_model,
      analyzer_api_key,
      generator_provider,
      generator_model,
      generator_api_key,
      master_content,
      master_resume_prompt,
      master_cover_letter_prompt,
    } = req.body;

    // Validate master_content length if provided (max ~50KB for 2-3 pages)
    if (master_content && master_content.length > 50000) {
      return res.status(400).json({ error: 'Master content exceeds maximum length (50KB)' });
    }

    // Check if config exists
    const existingConfig = await pool.query(
      'SELECT * FROM llm_configs WHERE user_id = $1',
      [userId]
    );

    // If only master_content or master prompts are provided, do a partial update
    const isPartialUpdate = !analyzer_provider && !analyzer_model && !analyzer_api_key && !generator_provider && !generator_model && !generator_api_key && (master_content || master_resume_prompt || master_cover_letter_prompt);

    if (isPartialUpdate) {
      // Partial update - only update master_content and/or master prompts
      console.log(`📝 Partial update attempt for user ${userId}, existingConfig rows: ${existingConfig.rows.length}`);
      
      if (existingConfig.rows.length === 0) {
        console.log(`❌ No config found for user ${userId}`);
        return res.status(400).json({ error: 'No existing configuration found. Please configure LLM providers first.' });
      }

      const result = await pool.query(
        `UPDATE llm_configs 
         SET master_content = COALESCE($1, master_content),
             master_resume_prompt = COALESCE($2, master_resume_prompt),
             master_cover_letter_prompt = COALESCE($3, master_cover_letter_prompt),
             updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = $4 
         RETURNING analyzer_provider, analyzer_model, analyzer_api_key, generator_provider, generator_model, generator_api_key, master_content, master_resume_prompt, master_cover_letter_prompt, is_active`,
        [master_content || null, master_resume_prompt || null, master_cover_letter_prompt || null, userId]
      );

      if (result.rows.length === 0) {
        console.log(`❌ Update failed for user ${userId}`);
        return res.status(500).json({ error: 'Failed to update configuration' });
      }

      console.log(`✅ Configuration updated for user ${userId}`);
      return res.json({
        message: 'Configuration saved successfully',
        config: result.rows[0],
      });
    }

    // Full update - validate all required fields
    if (
      !analyzer_provider ||
      !analyzer_model ||
      !analyzer_api_key ||
      !generator_provider ||
      !generator_model ||
      !generator_api_key
    ) {
      return res.status(400).json({ error: 'All analyzer and generator fields are required' });
    }

    // Validate models exist
    if (!AVAILABLE_MODELS[analyzer_provider]?.some(m => m.id === analyzer_model)) {
      return res.status(400).json({ error: 'Invalid analyzer provider or model' });
    }

    if (!AVAILABLE_MODELS[generator_provider]?.some(m => m.id === generator_model)) {
      return res.status(400).json({ error: 'Invalid generator provider or model' });
    }

    let result;
    if (existingConfig.rows.length > 0) {
      // Update existing config
      result = await pool.query(
        `UPDATE llm_configs 
         SET analyzer_provider = $1, analyzer_model = $2, analyzer_api_key = $3,
             generator_provider = $4, generator_model = $5, generator_api_key = $6,
             master_content = $7, master_resume_prompt = $8, master_cover_letter_prompt = $9,
             updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = $10 
         RETURNING analyzer_provider, analyzer_model, analyzer_api_key, generator_provider, generator_model, generator_api_key, master_content, master_resume_prompt, master_cover_letter_prompt, is_active`,
        [
          analyzer_provider,
          analyzer_model,
          analyzer_api_key,
          generator_provider,
          generator_model,
          generator_api_key,
          master_content || null,
          master_resume_prompt || null,
          master_cover_letter_prompt || null,
          userId,
        ]
      );
    } else {
      // Create new config
      result = await pool.query(
        `INSERT INTO llm_configs 
         (user_id, analyzer_provider, analyzer_model, analyzer_api_key, generator_provider, generator_model, generator_api_key, master_content, master_resume_prompt, master_cover_letter_prompt) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
         RETURNING analyzer_provider, analyzer_model, analyzer_api_key, generator_provider, generator_model, generator_api_key, master_content, master_resume_prompt, master_cover_letter_prompt, is_active`,
        [
          userId,
          analyzer_provider,
          analyzer_model,
          analyzer_api_key,
          generator_provider,
          generator_model,
          generator_api_key,
          master_content || null,
          master_resume_prompt || null,
          master_cover_letter_prompt || null,
        ]
      );
    }

    console.log(`✅ LLM config saved for user ${userId}:`);
    console.log(`   Analyzer: ${analyzer_provider} - ${analyzer_model}`);
    console.log(`   Generator: ${generator_provider} - ${generator_model}`);
    res.json({
      message: 'Configuration saved successfully',
      config: result.rows[0],
    });
  } catch (error) {
    console.error('Error saving LLM config:', error);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// Update user's LLM configuration (PUT for partial updates)
router.put('/config', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      master_resume_prompt,
      master_cover_letter_prompt,
    } = req.body;

    // Check if config exists
    const existingConfig = await pool.query(
      'SELECT * FROM llm_configs WHERE user_id = $1',
      [userId]
    );

    if (existingConfig.rows.length === 0) {
      return res.status(400).json({ error: 'No existing configuration found. Please configure LLM providers first.' });
    }

    // Update only the provided fields
    const result = await pool.query(
      `UPDATE llm_configs 
       SET master_resume_prompt = COALESCE($1, master_resume_prompt),
           master_cover_letter_prompt = COALESCE($2, master_cover_letter_prompt),
           updated_at = CURRENT_TIMESTAMP 
       WHERE user_id = $3 
       RETURNING analyzer_provider, analyzer_model, analyzer_api_key, generator_provider, generator_model, generator_api_key, master_content, master_resume_prompt, master_cover_letter_prompt, is_active`,
      [master_resume_prompt || null, master_cover_letter_prompt || null, userId]
    );

    if (result.rows.length === 0) {
      return res.status(500).json({ error: 'Failed to update configuration' });
    }

    console.log(`✅ Master prompts updated for user ${userId}`);
    res.json({
      message: 'Master prompts updated successfully',
      config: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating LLM config:', error);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

// Get user's LLM config with API key (for backend use only)
export const getUserLLMConfig = async (userId, type = 'both') => {
  try {
    const result = await pool.query(
      'SELECT analyzer_provider, analyzer_model, analyzer_api_key, generator_provider, generator_model, generator_api_key, master_content FROM llm_configs WHERE user_id = $1 AND is_active = TRUE',
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const config = result.rows[0];

    if (type === 'analyzer') {
      return {
        provider: config.analyzer_provider,
        model: config.analyzer_model,
        apiKey: config.analyzer_api_key,
      };
    } else if (type === 'generator') {
      return {
        provider: config.generator_provider,
        model: config.generator_model,
        apiKey: config.generator_api_key,
        masterContent: config.master_content,
      };
    } else {
      // Return both
      return {
        analyzer: {
          provider: config.analyzer_provider,
          model: config.analyzer_model,
          apiKey: config.analyzer_api_key,
        },
        generator: {
          provider: config.generator_provider,
          model: config.generator_model,
          apiKey: config.generator_api_key,
          masterContent: config.master_content,
        },
      };
    }
  } catch (error) {
    console.error('Error fetching user LLM config:', error);
    return null;
  }
};

export default router;
