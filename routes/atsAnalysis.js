import express from 'express';
import pool from '../config/database.js';
import { calculateATSScore, formatATSResponse } from '../services/atsService.js';
import { analyzeJobDescription as analyzeWithGemini } from '../services/geminiService.js';
import { analyzeJobDescription as analyzeWithClaude } from '../services/claudeService.js';
import { analyzeJobDescription as analyzeWithOpenAI } from '../services/openaiService.js';
import { getUserLLMConfig } from './llmConfig.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/ats-analysis
 * Analyze resume against job description and calculate ATS score
 * 
 * Request body:
 * {
 *   resumeId: string (optional - if not provided, uses latest resume),
 *   resumeText: string (optional - if not provided, fetches from DB),
 *   jobDescription: string (optional - if not provided, uses stored job description)
 * }
 */
router.post('/analysis', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { resumeId, resumeText, jobDescription } = req.body;

    console.log(`📊 ATS Analysis request for user ${userId}`);

    // Fetch resume if not provided
    let resume;
    if (resumeText) {
      resume = { master_resume_text: resumeText, job_description: jobDescription };
    } else {
      const query = resumeId
        ? 'SELECT id, master_resume_text, job_description, analysis_json FROM resumes WHERE id = $1 AND user_id = $2'
        : 'SELECT id, master_resume_text, job_description, analysis_json FROM resumes WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1';

      const params = resumeId ? [resumeId, userId] : [userId];
      const result = await pool.query(query, params);

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Resume not found. Please create a resume first.',
        });
      }

      resume = result.rows[0];
    }

    // Validate inputs
    if (!resume.master_resume_text) {
      return res.status(400).json({
        status: 'error',
        message: 'Resume text is empty. Please save a resume first.',
      });
    }

    if (!resume.job_description && !jobDescription) {
      return res.status(400).json({
        status: 'error',
        message: 'Job description is required. Please analyze a job description first.',
      });
    }

    const jd = jobDescription || resume.job_description;

    // Get or create job analysis
    let jobAnalysis;
    if (resume.analysis_json) {
      jobAnalysis = JSON.parse(resume.analysis_json);
      console.log('✅ Using cached job analysis');
    } else {
      console.log(`📊 Fetching LLM config for user ${userId}...`);
      const userConfig = await getUserLLMConfig(userId, 'analyzer');
      
      console.log('🔍 [DEBUG] userConfig received:', JSON.stringify(userConfig, null, 2));
      
      if (!userConfig) {
        return res.status(400).json({
          status: 'error',
          message: 'LLM configuration not found. Please configure your analyzer in the Configuration page.',
        });
      }

      try {
        const provider = userConfig.provider || 'gemini';
        const analyzerConfig = {
          apiKey: userConfig.apiKey,
          model: userConfig.model,
        };

        // Validate provider and model are not empty (actual validation happens when API is called)
        const supportedProviders = ['claude', 'openai', 'gemini'];
        if (!supportedProviders.includes(provider)) {
          console.error(`❌ Invalid provider: ${provider}`);
          return res.status(400).json({
            status: 'error',
            message: `Invalid provider "${provider}". Supported providers: ${supportedProviders.join(', ')}`,
          });
        }

        if (!analyzerConfig.model || typeof analyzerConfig.model !== 'string') {
          console.error(`❌ Invalid model for provider ${provider}: ${analyzerConfig.model}`);
          return res.status(400).json({
            status: 'error',
            message: `Invalid model "${analyzerConfig.model}" for provider "${provider}"`,
          });
        }

        console.log(`🤖 Analyzing job description with ${provider}...`);
        console.log(`📋 Config - Provider: ${provider}, Model: ${analyzerConfig.model}, Has API Key: ${!!analyzerConfig.apiKey}`);
        console.log(`🔍 [DEBUG] Full analyzerConfig:`, JSON.stringify({ 
          provider, 
          model: analyzerConfig.model, 
          hasApiKey: !!analyzerConfig.apiKey,
          apiKeyLength: analyzerConfig.apiKey ? analyzerConfig.apiKey.length : 0
        }, null, 2));

        if (provider === 'claude') {
          console.log('🔍 [DEBUG] Calling analyzeWithClaude with config:', { model: analyzerConfig.model, hasApiKey: !!analyzerConfig.apiKey });
          jobAnalysis = await analyzeWithClaude(jd, resume.master_resume_text, analyzerConfig);
          console.log('✅ Job analysis received from Claude');
        } else if (provider === 'openai') {
          console.log('🔍 [DEBUG] Calling analyzeWithOpenAI with config:', { model: analyzerConfig.model, hasApiKey: !!analyzerConfig.apiKey });
          jobAnalysis = await analyzeWithOpenAI(jd, resume.master_resume_text, analyzerConfig);
          console.log('✅ Job analysis received from OpenAI');
        } else {
          console.log('🔍 [DEBUG] Calling analyzeWithGemini with config:', { model: analyzerConfig.model, hasApiKey: !!analyzerConfig.apiKey });
          jobAnalysis = await analyzeWithGemini(jd, resume.master_resume_text, analyzerConfig);
          console.log('✅ Job analysis received from Gemini');
        }
      } catch (analysisError) {
        console.error(`❌ Analysis failed: ${analysisError.message}`);
        console.error('🔍 [DEBUG] Full error:', analysisError);
        return res.status(500).json({
          status: 'error',
          message: `Failed to analyze job description: ${analysisError.message}`,
          error: analysisError.message,
        });
      }
    }

    // Calculate ATS score
    console.log('📈 Calculating ATS score...');
    const atsAnalysis = await calculateATSScore(resume.master_resume_text, jd, jobAnalysis);

    // Store ATS score in database (optional - for analytics)
    if (resume.id) {
      await pool.query(
        `UPDATE resumes 
         SET ats_score = $1, ats_analysis = $2, updated_at = NOW()
         WHERE id = $3`,
        [atsAnalysis.ats_score, JSON.stringify(atsAnalysis), resume.id]
      );
      console.log(`✅ ATS score saved: ${atsAnalysis.ats_score}%`);
    }

    // Format and return response
    const response = formatATSResponse(atsAnalysis);

    res.status(200).json({
      status: 'success',
      message: 'ATS analysis completed',
      data: response,
    });
  } catch (error) {
    console.error('❌ ATS analysis error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to analyze ATS score',
      error: error.message,
    });
  }
});

/**
 * GET /api/ats-analysis/:resumeId
 * Get previously calculated ATS score for a resume
 */
router.get('/analysis/:resumeId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { resumeId } = req.params;

    const result = await pool.query(
      'SELECT ats_score, ats_analysis FROM resumes WHERE id = $1 AND user_id = $2',
      [resumeId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Resume not found',
      });
    }

    const resume = result.rows[0];

    if (!resume.ats_analysis) {
      return res.status(404).json({
        status: 'error',
        message: 'ATS analysis not found. Please run analysis first.',
      });
    }

    const atsAnalysis = JSON.parse(resume.ats_analysis);
    const response = formatATSResponse(atsAnalysis);

    res.status(200).json({
      status: 'success',
      data: response,
    });
  } catch (error) {
    console.error('❌ Error fetching ATS analysis:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch ATS analysis',
    });
  }
});

export default router;
