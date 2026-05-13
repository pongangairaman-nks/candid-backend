import pool from '../config/database.js';
import { logger } from '../services/logger.js';
import { getUserFeatureFlags } from './featureFlags.js';

// Default cheap models for various tasks
const CHEAP_DEFAULTS = {
  claude: 'claude-3-haiku-20240307',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.5-flash',
};

// Strong models for generation and mapping
const STRONG_DEFAULTS = {
  claude: 'claude-opus-4-1-20250805',
  openai: 'gpt-4o',
  gemini: 'gemini-2.5-pro',
};

// Task-to-tier mapping
const TASK_TIER_MAPPING = {
  // Analysis tasks - use cheap by default
  jd_analysis: 'cheap',
  ats_extract: 'cheap',
  rescore: 'cheap',
  section_optimize_fast: 'cheap',

  // Strong tasks - use strong by default
  ats_map: 'strong',
  generate_resume: 'strong',
  section_optimize_high: 'strong',
};

/**
 * Get LLM config with tier awareness
 * Returns provider + model + key based on user's config and task type
 */
export const getTieredLLMConfig = async (user_id, configType, task) => {
  try {
    const flags = await getUserFeatureFlags(user_id);

    // Fetch user's base config
    const result = await pool.query(
      `SELECT 
        analyzer_provider, analyzer_model, analyzer_api_key,
        generator_provider, generator_model, generator_api_key
       FROM llm_configs WHERE user_id = $1`,
      [user_id]
    );

    if (result.rows?.length === 0) {
      throw new Error('LLM configuration not found');
    }

    const config = result.rows?.[0];

    // Determine which config to use (analyzer or generator)
    let baseProvider, baseModel, baseApiKey;

    if (configType === 'analyzer') {
      baseProvider = config?.analyzer_provider;
      baseModel = config?.analyzer_model;
      baseApiKey = config?.analyzer_api_key;
    } else if (configType === 'generator') {
      baseProvider = config?.generator_provider;
      baseModel = config?.generator_model;
      baseApiKey = config?.generator_api_key;
    } else {
      throw new Error('Invalid config type');
    }

    // Determine tier based on task and flags
    let tier = TASK_TIER_MAPPING[task] || 'cheap';

    // Check if task-specific tier forcing is enabled
    if (task === 'ats_extract' && flags.analyzerTierMode) {
      tier = 'cheap';
    } else if (task === 'ats_map' && flags.atsMappingTierMode) {
      tier = 'cheap';
    }

    // Determine final model based on tier and user config
    // For strong tasks, use strong default if user's model is weak (Haiku/Mini)
    let finalModel = baseModel;
    
    const isWeakModel = baseModel?.includes('haiku') || baseModel?.includes('mini') || baseModel?.includes('flash');
    const isStrongTask = tier === 'strong';
    
    if (isStrongTask && isWeakModel) {
      // Use strong default for strong tasks with weak models
      finalModel = STRONG_DEFAULTS[baseProvider] || baseModel;
      console.log(`⚠️ Upgrading model for strong task: ${baseModel} → ${finalModel}`);
    }

    return {
      provider: baseProvider,
      model: finalModel,
      apiKey: baseApiKey,
      tier,
      task,
    };
  } catch (error) {
    logger.error('Failed to get tiered LLM config', { user_id, configType, task, error: error.message });
    throw error;
  }
};

/**
 * Get full LLM config (both analyzer and generator)
 */
export const getFullLLMConfig = async (user_id) => {
  try {
    const result = await pool.query(
      `SELECT 
        analyzer_provider, analyzer_model, analyzer_api_key,
        generator_provider, generator_model, generator_api_key,
        master_content, master_resume_prompt, master_cover_letter_prompt
       FROM llm_configs WHERE user_id = $1`,
      [user_id]
    );

    if (result.rows?.length === 0) {
      throw new Error('LLM configuration not found');
    }

    const config = result.rows?.[0];

    return {
      analyzer: {
        provider: config?.analyzer_provider,
        model: config?.analyzer_model,
        apiKey: config?.analyzer_api_key,
      },
      generator: {
        provider: config?.generator_provider,
        model: config?.generator_model,
        apiKey: config?.generatorapikey,
      },
      masterContent: config?.master_content,
      masterResumePrompt: config?.master_resume_prompt,
      masterCoverLetterPrompt: config?.master_cover_letter_prompt,
    };
  } catch (error) {
    logger.error('Failed to get full LLM config', { user_id, error: error.message });
    throw error;
  }
};

/**
 * Determine which model to use based on task and user tier preference
 */
export const getOptimalModel = (provider, task, userConfig) => {
  const taskTier = TASK_TIER_MAPPING[task] || 'cheap';

  // If user has a custom model set, prefer it unless tier is forcing cheap
  if (userConfig?.model) {
    return userConfig?.model;
  }

  // Use defaults based on tier
  if (taskTier === 'cheap') {
    return CHEAP_DEFAULTS[provider] || CHEAP_DEFAULTS.openai;
  } else {
    return STRONG_DEFAULTS[provider] || STRONG_DEFAULTS.openai;
  }
};

/**
 * Get recommended model for cost optimization
 */
export const getRecommendedCheapModel = (provider) => {
  return CHEAP_DEFAULTS[provider] || CHEAP_DEFAULTS.openai;
};

export const getRecommendedStrongModel = (provider) => {
  return STRONG_DEFAULTS[provider] || STRONG_DEFAULTS.openai;
};

/**
 * Calculate estimated cost for a task
 */
export const estimateTaskCost = (provider, task, estimatedInputTokens = 1000) => {
  const tier = TASK_TIER_MAPPING[task] || 'cheap';
  const model = tier === 'cheap' 
    ? CHEAP_DEFAULTS[provider]
    : STRONG_DEFAULTS[provider];

  // Approximate pricing per 1M tokens (as of 2024)
  const pricing = {
    'claude-3-haiku-20240307': { input: 0.80, output: 4.0 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gemini-2.5-flash': { input: 0, output: 0 }, // free
    'claude-3-5-sonnet-latest': { input: 3.0, output: 15.0 },
    'gpt-4o': { input: 5.0, output: 15.0 },
    'gemini-2.5-pro': { input: 3.5, output: 10.5 },
  };

  const rate = pricing[model] || { input: 2.0, output: 6.0 };
  const estimatedOutputTokens = Math.ceil(estimatedInputTokens * 0.25);
  const cost = ((estimatedInputTokens * rate.input) + (estimatedOutputTokens * rate.output)) / 1000000;

  return {
    model,
    tier,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedCost: cost.toFixed(4),
  };
};
