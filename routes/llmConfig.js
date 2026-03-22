import express from 'express';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import OpenAI from 'openai';

const router = express.Router();

// Curated model registry - only chat-capable models
const ALLOWED_OPENAI_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4-turbo',
  'gpt-4',
];

const OPENAI_MODEL_LABELS = {
  'gpt-4o-mini': 'GPT-4o Mini (Fast & Cheap)',
  'gpt-4o': 'GPT-4o (Balanced)',
  'gpt-4-turbo': 'GPT-4 Turbo (High Quality)',
  'gpt-4': 'GPT-4 (Legacy)',
};

// Available models configuration
const AVAILABLE_MODELS = {
  claude: [
    { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet (Recommended)', provider: 'claude' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku (Cheap & Fast)', provider: 'claude' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus (Best Quality)', provider: 'claude' },
  ],
  openai: [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast & Cheap)', provider: 'openai' },
    { id: 'gpt-4o', name: 'GPT-4o (Balanced)', provider: 'openai' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo (High Quality)', provider: 'openai' },
  ],
  gemini: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Free)', provider: 'gemini' },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', provider: 'gemini' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'gemini' },
    { id: 'gemini-3-flash', name: 'Gemini 3 Flash', provider: 'gemini' },
  ],
};

// Get available providers
router.get('/providers', (req, res) => {
  try {
    const providers = [
      { id: 'claude', name: 'Claude (Anthropic)', provider: 'claude' },
      { id: 'openai', name: 'OpenAI', provider: 'openai' },
      { id: 'gemini', name: 'Gemini (Google)', provider: 'gemini' },
    ];
    res.json(providers);
  } catch (error) {
    console.error('Error fetching providers:', error);
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
});

// Get available models (static fallback)
router.get('/models', (req, res) => {
  try {
    res.json(AVAILABLE_MODELS);
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

// Get models for a specific provider (real-time from API or cached fallback)
router.get('/models/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const apiKey = req.query.apiKey;

    console.log(`🔍 Fetching models for provider: ${provider}`);

    if (provider === 'claude') {
      if (!apiKey) {
        console.warn('⚠️ No Claude API key provided, using cached models');
        const models = AVAILABLE_MODELS['claude'] || [];
        return res.json({ 
          models, 
          count: models.length,
          provider: 'claude',
          source: 'cached'
        });
      }

      try {
        console.log('🔍 Fetching Claude models from Anthropic REST API...');
        const response = await fetch('https://api.anthropic.com/v1/models', {
          method: 'GET',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
        });

        if (!response.ok) {
          console.warn(`⚠️ Anthropic API returned ${response.status}, using cached models`);
          const models = AVAILABLE_MODELS['claude'] || [];
          return res.json({ 
            models, 
            count: models.length,
            provider: 'claude',
            source: 'cached',
            warning: `API returned ${response.status}`
          });
        }

        const data = await response.json();
        const models = [];

        if (data.data && Array.isArray(data.data)) {
          for (const modelInfo of data.data) {
            if (modelInfo.id && modelInfo.id.startsWith('claude')) {
              models.push({
                id: modelInfo.id,
                name: modelInfo.display_name || modelInfo.id,
                provider: 'claude',
                created_at: modelInfo.created_at,
                max_input_tokens: modelInfo.max_input_tokens,
                max_tokens: modelInfo.max_tokens,
              });
            }
          }
        }

        if (models.length === 0) {
          console.warn('⚠️ No Claude models returned from API, using cached models');
          const cachedModels = AVAILABLE_MODELS['claude'] || [];
          return res.json({ 
            models: cachedModels, 
            count: cachedModels.length,
            provider: 'claude',
            source: 'cached'
          });
        }

        console.log(`✅ Found ${models.length} Claude models from API`);
        return res.json({ 
          models, 
          count: models.length,
          provider: 'claude',
          source: 'api'
        });
      } catch (apiError) {
        console.error('❌ Error fetching from Anthropic API:', apiError.message);
        const models = AVAILABLE_MODELS['claude'] || [];
        return res.json({ 
          models, 
          count: models.length,
          provider: 'claude',
          source: 'cached',
          error: apiError.message
        });
      }
    } else if (provider === 'openai') {
      if (!apiKey) {
        console.warn('⚠️ No OpenAI API key provided, using cached models');
        const models = AVAILABLE_MODELS['openai'] || [];
        return res.json({ 
          models, 
          count: models.length,
          provider: 'openai',
          source: 'cached'
        });
      }

      try {
        console.log('🔍 Fetching OpenAI models from OpenAI API...');
        const client = new OpenAI({ apiKey });
        const response = await client.models.list();
        const models = [];

        if (response.data && Array.isArray(response.data)) {
          for (const modelInfo of response.data) {
            // Filter only allowed chat models
            if (modelInfo.id && ALLOWED_OPENAI_MODELS.includes(modelInfo.id)) {
              models.push({
                id: modelInfo.id,
                name: OPENAI_MODEL_LABELS[modelInfo.id] || modelInfo.id,
                provider: 'openai',
                created_at: modelInfo.created_at,
              });
            }
          }
        }

        if (models.length === 0) {
          console.warn('⚠️ No OpenAI chat models found, using cached models');
          const cachedModels = AVAILABLE_MODELS['openai'] || [];
          return res.json({ 
            models: cachedModels, 
            count: cachedModels.length,
            provider: 'openai',
            source: 'cached'
          });
        }

        console.log(`✅ Found ${models.length} OpenAI models from API`);
        return res.json({ 
          models, 
          count: models.length,
          provider: 'openai',
          source: 'api'
        });
      } catch (apiError) {
        console.error('❌ Error fetching from OpenAI API:', apiError.message);
        const models = AVAILABLE_MODELS['openai'] || [];
        return res.json({ 
          models, 
          count: models.length,
          provider: 'openai',
          source: 'cached',
          error: apiError.message
        });
      }
    } else {
      // Return static models for other providers
      const models = AVAILABLE_MODELS[provider] || [];
      
      if (models.length === 0) {
        return res.status(404).json({ 
          error: `No models found for provider: ${provider}`,
          models: [] 
        });
      }

      console.log(`✅ Found ${models.length} ${provider} models`);
      return res.json({ 
        models, 
        count: models.length,
        provider: provider,
        source: 'cached'
      });
    }
  } catch (error) {
    console.error(`❌ Error fetching models for provider:`, error.message);
    res.status(500).json({ 
      error: `Failed to fetch models: ${error.message}`,
      models: [] 
    });
  }
});

// Get Claude models dynamically from Anthropic API
router.get('/models/claude', async (req, res) => {
  try {
    const apiKey = req.query.apiKey || process.env.CLAUDE_API_KEY;
    
    if (!apiKey) {
      console.warn('⚠️ No Claude API key provided');
      return res.status(400).json({ 
        error: 'Claude API key is required to fetch available models',
        models: [] 
      });
    }

    const client = new Anthropic({ apiKey });
    const models = [];

    console.log('🔍 Fetching Claude models from Anthropic API...');
    
    // Fetch all available models
    for await (const modelInfo of client.models.list()) {
      // Filter for Claude models only
      if (modelInfo.id.startsWith('claude')) {
        models.push({
          id: modelInfo.id,
          name: modelInfo.display_name || modelInfo.id,
          provider: 'claude',
          created_at: modelInfo.created_at,
          max_input_tokens: modelInfo.max_input_tokens,
          max_tokens: modelInfo.max_tokens,
        });
      }
    }

    console.log(`✅ Found ${models.length} Claude models`);
    res.json({ models, count: models.length });
  } catch (error) {
    console.error('❌ Error fetching Claude models:', error.message);
    res.status(500).json({ 
      error: `Failed to fetch Claude models: ${error.message}`,
      models: [] 
    });
  }
});

// Get available models for a provider using backend environment API keys
router.get('/models-for-user/:provider', authenticateToken, async (req, res) => {
  try {
    const { provider } = req.params;

    console.log(`🔍 Fetching ${provider} models using backend environment API key`);

    // Get API key from environment variables
    let apiKey = '';
    if (provider === 'claude') {
      apiKey = process.env.CLAUDE_API_KEY;
    } else if (provider === 'openai') {
      apiKey = process.env.OPENAI_API_KEY;
    } else if (provider === 'gemini') {
      apiKey = process.env.GEMINI_API_KEY;
    }

    if (!apiKey) {
      console.warn(`⚠️ No API key found in environment for ${provider}`);
      const models = AVAILABLE_MODELS[provider] || [];
      return res.json({
        models,
        count: models.length,
        provider,
        source: 'cached',
        warning: `No API key configured for ${provider}, using cached models`
      });
    }

    if (provider === 'claude') {
      try {
        console.log('🔍 Fetching Claude models from Anthropic REST API...');
        const response = await fetch('https://api.anthropic.com/v1/models', {
          method: 'GET',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
        });

        if (!response.ok) {
          console.warn(`⚠️ Anthropic API returned ${response.status}, using cached models`);
          const models = AVAILABLE_MODELS['claude'] || [];
          return res.json({
            models,
            count: models.length,
            provider: 'claude',
            source: 'cached',
            warning: `API returned ${response.status}`
          });
        }

        const data = await response.json();
        const models = [];

        if (data.data && Array.isArray(data.data)) {
          for (const modelInfo of data.data) {
            if (modelInfo.id && modelInfo.id.startsWith('claude')) {
              models.push({
                id: modelInfo.id,
                name: modelInfo.display_name || modelInfo.id,
                provider: 'claude',
                created_at: modelInfo.created_at,
                max_input_tokens: modelInfo.max_input_tokens,
                max_tokens: modelInfo.max_tokens,
              });
            }
          }
        }

        if (models.length === 0) {
          console.warn('⚠️ No Claude models returned from API, using cached models');
          const cachedModels = AVAILABLE_MODELS['claude'] || [];
          return res.json({
            models: cachedModels,
            count: cachedModels.length,
            provider: 'claude',
            source: 'cached'
          });
        }

        console.log(`✅ Found ${models.length} Claude models from API`);
        return res.json({
          models,
          count: models.length,
          provider: 'claude',
          source: 'api'
        });
      } catch (apiError) {
        console.error('❌ Error fetching from Anthropic API:', apiError.message);
        const models = AVAILABLE_MODELS['claude'] || [];
        return res.json({
          models,
          count: models.length,
          provider: 'claude',
          source: 'cached',
          error: apiError.message
        });
      }
    } else if (provider === 'openai') {
      try {
        console.log('🔍 Fetching OpenAI models from OpenAI API...');
        const client = new OpenAI({ apiKey });
        const response = await client.models.list();
        const models = [];

        if (response.data && Array.isArray(response.data)) {
          for (const modelInfo of response.data) {
            if (modelInfo.id && ALLOWED_OPENAI_MODELS.includes(modelInfo.id)) {
              models.push({
                id: modelInfo.id,
                name: OPENAI_MODEL_LABELS[modelInfo.id] || modelInfo.id,
                provider: 'openai',
                created_at: modelInfo.created_at,
              });
            }
          }
        }

        if (models.length === 0) {
          console.warn('⚠️ No OpenAI chat models found, using cached models');
          const cachedModels = AVAILABLE_MODELS['openai'] || [];
          return res.json({
            models: cachedModels,
            count: cachedModels.length,
            provider: 'openai',
            source: 'cached'
          });
        }

        console.log(`✅ Found ${models.length} OpenAI models from API`);
        return res.json({
          models,
          count: models.length,
          provider: 'openai',
          source: 'api'
        });
      } catch (apiError) {
        console.error('❌ Error fetching from OpenAI API:', apiError.message);
        const models = AVAILABLE_MODELS['openai'] || [];
        return res.json({
          models,
          count: models.length,
          provider: 'openai',
          source: 'cached',
          error: apiError.message
        });
      }
    } else {
      // Return static models for other providers
      const models = AVAILABLE_MODELS[provider] || [];
      return res.json({
        models,
        count: models.length,
        provider,
        source: 'cached'
      });
    }
  } catch (error) {
    console.error('❌ Error fetching models for user:', error.message);
    res.status(500).json({
      error: `Failed to fetch models: ${error.message}`,
      models: []
    });
  }
});

// Get user's LLM configuration
router.get('/config', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      'SELECT analyzer_provider, analyzer_model, analyzer_api_key, generator_provider, generator_model, generator_api_key, master_content, master_resume_prompt, master_cover_letter_prompt, use_latex_template, is_active FROM llm_configs WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Return default config if not set
      return res.json({
        analyzer_provider: 'claude',
        analyzer_model: 'claude-3-5-haiku-20241022',
        analyzer_api_key: null,
        generator_provider: 'openai',
        generator_model: 'gpt-4o-mini',
        generator_api_key: null,
        master_content: null,
        master_resume_prompt: null,
        master_cover_letter_prompt: null,
        use_latex_template: true,
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
      use_latex_template,
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
    const isPartialUpdate = !analyzer_provider && !analyzer_model && !analyzer_api_key && !generator_provider && !generator_model && !generator_api_key && (master_content || master_resume_prompt || master_cover_letter_prompt || use_latex_template !== undefined);

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
             use_latex_template = COALESCE($4, use_latex_template),
             updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = $5 
         RETURNING analyzer_provider, analyzer_model, analyzer_api_key, generator_provider, generator_model, generator_api_key, master_content, master_resume_prompt, master_cover_letter_prompt, use_latex_template, is_active`,
        [master_content || null, master_resume_prompt || null, master_cover_letter_prompt || null, use_latex_template !== undefined ? use_latex_template : null, userId]
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

    // Validate providers are supported
    const supportedProviders = ['claude', 'openai', 'gemini'];
    if (!supportedProviders.includes(analyzer_provider)) {
      return res.status(400).json({ error: 'Invalid analyzer provider' });
    }

    if (!supportedProviders.includes(generator_provider)) {
      return res.status(400).json({ error: 'Invalid generator provider' });
    }

    // Validate model IDs are not empty (actual validation happens when API is called)
    if (!analyzer_model || typeof analyzer_model !== 'string') {
      return res.status(400).json({ error: 'Invalid analyzer model' });
    }

    if (!generator_model || typeof generator_model !== 'string') {
      return res.status(400).json({ error: 'Invalid generator model' });
    }

    let result;
    if (existingConfig.rows.length > 0) {
      // Update existing config - preserve master prompts if not provided
      // Build dynamic update query based on what fields are provided
      let updateQuery = `UPDATE llm_configs 
         SET analyzer_provider = $1, analyzer_model = $2, analyzer_api_key = $3,
             generator_provider = $4, generator_model = $5, generator_api_key = $6`;
      
      const updateFields = [
        analyzer_provider,
        analyzer_model,
        analyzer_api_key,
        generator_provider,
        generator_model,
        generator_api_key,
      ];
      
      let paramIndex = 7;
      
      // Only update master_content if explicitly provided
      if (master_content !== undefined) {
        updateQuery += `, master_content = $${paramIndex}`;
        updateFields.push(master_content);
        paramIndex++;
      }
      
      // Only update master_resume_prompt if explicitly provided
      if (master_resume_prompt !== undefined) {
        updateQuery += `, master_resume_prompt = $${paramIndex}`;
        updateFields.push(master_resume_prompt);
        paramIndex++;
      }
      
      // Only update master_cover_letter_prompt if explicitly provided
      if (master_cover_letter_prompt !== undefined) {
        updateQuery += `, master_cover_letter_prompt = $${paramIndex}`;
        updateFields.push(master_cover_letter_prompt);
        paramIndex++;
      }
      
      // Only update use_latex_template if explicitly provided
      if (use_latex_template !== undefined) {
        updateQuery += `, use_latex_template = $${paramIndex}`;
        updateFields.push(use_latex_template);
        paramIndex++;
      }
      
      updateQuery += `, updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = $${paramIndex} 
         RETURNING analyzer_provider, analyzer_model, analyzer_api_key, generator_provider, generator_model, generator_api_key, master_content, master_resume_prompt, master_cover_letter_prompt, use_latex_template, is_active`;
      
      updateFields.push(userId);

      result = await pool.query(updateQuery, updateFields);
    } else {
      // Create new config
      result = await pool.query(
        `INSERT INTO llm_configs 
         (user_id, analyzer_provider, analyzer_model, analyzer_api_key, generator_provider, generator_model, generator_api_key, master_content, master_resume_prompt, master_cover_letter_prompt, use_latex_template) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
         RETURNING analyzer_provider, analyzer_model, analyzer_api_key, generator_provider, generator_model, generator_api_key, master_content, master_resume_prompt, master_cover_letter_prompt, use_latex_template, is_active`,
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
          use_latex_template !== undefined ? use_latex_template : true,
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
      master_content,
    } = req.body;

    // Check if config exists
    const existingConfig = await pool.query(
      'SELECT * FROM llm_configs WHERE user_id = $1',
      [userId]
    );

    if (existingConfig.rows.length === 0) {
      // Create a default config with the provided prompts
      console.log(`📝 Creating default config for user ${userId}`);
      const result = await pool.query(
        `INSERT INTO llm_configs 
         (user_id, analyzer_provider, analyzer_model, analyzer_api_key, generator_provider, generator_model, generator_api_key, master_content, master_resume_prompt, master_cover_letter_prompt) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
         RETURNING analyzer_provider, analyzer_model, analyzer_api_key, generator_provider, generator_model, generator_api_key, master_content, master_resume_prompt, master_cover_letter_prompt, is_active`,
        [
          userId,
          'claude',
          'claude-3-5-haiku-20241022',
          null,
          'openai',
          'gpt-4o-mini',
          null,
          master_content || null,
          master_resume_prompt || null,
          master_cover_letter_prompt || null,
        ]
      );

      console.log(`✅ Default config created for user ${userId}`);
      return res.json({
        message: 'Configuration created successfully',
        config: result.rows[0],
      });
    }

    // Update only the provided fields
    const result = await pool.query(
      `UPDATE llm_configs 
       SET master_resume_prompt = COALESCE($1, master_resume_prompt),
           master_cover_letter_prompt = COALESCE($2, master_cover_letter_prompt),
           master_content = COALESCE($3, master_content),
           updated_at = CURRENT_TIMESTAMP 
       WHERE user_id = $4 
       RETURNING analyzer_provider, analyzer_model, analyzer_api_key, generator_provider, generator_model, generator_api_key, master_content, master_resume_prompt, master_cover_letter_prompt, is_active`,
      [master_resume_prompt || null, master_cover_letter_prompt || null, master_content || null, userId]
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

    // Helper function to get API key with fallback to environment variables
    const getApiKey = (provider, configApiKey) => {
      if (configApiKey) return configApiKey;
      if (provider === 'claude') return process.env.CLAUDE_API_KEY;
      if (provider === 'openai') return process.env.OPENAI_API_KEY;
      if (provider === 'gemini') return process.env.GEMINI_API_KEY;
      return null;
    };

    if (type === 'analyzer') {
      return {
        provider: config.analyzer_provider,
        model: config.analyzer_model,
        apiKey: getApiKey(config.analyzer_provider, config.analyzer_api_key),
      };
    } else if (type === 'generator') {
      return {
        provider: config.generator_provider,
        model: config.generator_model,
        apiKey: getApiKey(config.generator_provider, config.generator_api_key),
        masterContent: config.master_content,
      };
    } else {
      // Return both
      return {
        analyzer: {
          provider: config.analyzer_provider,
          model: config.analyzer_model,
          apiKey: getApiKey(config.analyzer_provider, config.analyzer_api_key),
        },
        generator: {
          provider: config.generator_provider,
          model: config.generator_model,
          apiKey: getApiKey(config.generator_provider, config.generator_api_key),
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
