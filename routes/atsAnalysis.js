import express from 'express';
import pool from '../config/database.js';
import { calculateATSScore, formatATSResponse } from '../services/atsService.js';
import { analyzeJobDescription as analyzeWithGemini } from '../services/geminiService.js';
import { analyzeJobDescription as analyzeWithClaude } from '../services/claudeService.js';
import { analyzeJobDescription as analyzeWithOpenAI } from '../services/openaiService.js';
import { getUserLLMConfig } from './llmConfig.js';
import { authenticateToken } from '../middleware/auth.js';
import { extractRequirementsLLM, mapRequirementsToResumeLLM, incrementalRescoreLLM } from '../services/atsLLMService.js';

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

/**
 * POST /api/ats/llm/analysis
 * LLM-based ATS baseline analysis (token-efficient). Uses cheaper models by default.
 */
router.post('/llm/analysis', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { resumeId, resumeText, jobDescription, force } = req.body || {};

    console.log(`📊 [LLM ATS] Baseline analysis request for user ${userId}`);

    // Fetch resume if not provided
    let resume;
    if (resumeText) {
      resume = { id: null, master_resume_text: resumeText, job_description: jobDescription, ats_analysis: null };
    } else {
      const query = resumeId
        ? 'SELECT id, master_resume_text, job_description, ats_analysis FROM resumes WHERE id = $1 AND user_id = $2'
        : 'SELECT id, master_resume_text, job_description, ats_analysis FROM resumes WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1';
      const params = resumeId ? [resumeId, userId] : [userId];
      const result = await pool.query(query, params);
      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Resume not found. Please create a resume first.' });
      }
      resume = result.rows[0];
    }

    if (!resume.master_resume_text) {
      return res.status(400).json({ status: 'error', message: 'Resume text is empty. Please save a resume first.' });
    }

    const jd = jobDescription || resume.job_description;
    if (!jd) {
      return res.status(400).json({ status: 'error', message: 'Job description is required. Please analyze a job description first.' });
    }

    // Reuse cached baseline if present and not forced
    let existingATS = null;
    if (resume.ats_analysis) {
      try { existingATS = JSON.parse(resume.ats_analysis); } catch { existingATS = null; }
    }
    if (existingATS?.llm && !force) {
      console.log('✅ [LLM ATS] Using cached baseline');
      return res.status(200).json({ status: 'success', message: 'LLM ATS baseline (cached)', data: existingATS.llm });
    }

    // Analyzer config (use cheaper defaults inside service)
    let analyzerConfig = await getUserLLMConfig(userId, 'analyzer');
    if (!analyzerConfig) {
      if (process.env.LLM_STUB === 'true') {
        analyzerConfig = { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'stub' };
      } else {
        return res.status(400).json({ status: 'error', message: 'LLM analyzer configuration not found. Configure in Settings.' });
      }
    }

    const tExtractStart = Date.now();
    const requirements = await extractRequirementsLLM(jd, analyzerConfig);
    const tExtractMs = Date.now() - tExtractStart;
    console.log(`✅ [LLM ATS] Extracted ${requirements.length} requirements`);

    const tMapStart = Date.now();
    const mapping = await mapRequirementsToResumeLLM(requirements, resume.master_resume_text, analyzerConfig);
    const tMapMs = Date.now() - tMapStart;
    console.log(`✅ [LLM ATS] Mapped ${mapping.mappings.length} requirements, score=${mapping.overall_score}`);

    // Merge and persist under ats_analysis.llm while keeping top-level compatibility
    const now = new Date().toISOString();
    const newATS = existingATS || {};
    newATS.llm = {
      requirements,
      mappings: mapping.mappings,
      overall_score: mapping.overall_score,
      keyword_gaps: mapping.keyword_gaps,
      strengths: mapping.strengths,
      critical_gaps: mapping.critical_gaps,
      updated_at: now,
    };
    const usageEntries = [
      {
        ts: now,
        phase: 'analysis.extract',
        provider: analyzerConfig.provider,
        model: analyzerConfig.model || null,
        latency_ms: tExtractMs,
        stub: process.env.LLM_STUB === 'true'
      },
      {
        ts: now,
        phase: 'analysis.map',
        provider: analyzerConfig.provider,
        model: analyzerConfig.model || null,
        latency_ms: tMapMs,
        stub: process.env.LLM_STUB === 'true'
      }
    ];
    const prevUsage = Array.isArray(existingATS?.llm_usage) ? existingATS.llm_usage : [];
    newATS.llm_usage = [...prevUsage, ...usageEntries];
    // Optionally mirror overall score to top-level for convenience
    newATS.ats_score = mapping.overall_score;

    if (resume.id) {
      await pool.query(
        `UPDATE resumes SET ats_analysis = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(newATS), resume.id]
      );
    }

    return res.status(200).json({ status: 'success', message: 'LLM ATS baseline computed', data: newATS.llm });
  } catch (error) {
    console.error('❌ [LLM ATS] Baseline error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to compute LLM ATS baseline', error: error.message });
  }
});

/**
 * POST /api/ats/llm/rescore
 * Incremental re-score after a section edit (cheap model, minimal tokens)
 */
router.post('/llm/rescore', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { resumeId, section_key, before_text, after_text } = req.body || {};

    if (!resumeId) {
      return res.status(400).json({ status: 'error', message: 'resumeId is required' });
    }

    const result = await pool.query(
      'SELECT id, ats_analysis FROM resumes WHERE id = $1 AND user_id = $2',
      [resumeId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Resume not found' });
    }

    let ats = null;
    try { ats = result.rows[0].ats_analysis ? JSON.parse(result.rows[0].ats_analysis) : null; } catch { ats = null; }
    if (!ats?.llm) {
      return res.status(400).json({ status: 'error', message: 'LLM ATS baseline not found. Run /api/ats/llm/analysis first.' });
    }

    const baseline = ats.llm;
    const baselineScore = typeof baseline.overall_score === 'number' ? baseline.overall_score : 0;

    // Determine affected requirements
    let affectedBase = baseline.mappings || [];
    if (section_key) {
      affectedBase = affectedBase.filter(m => m.section_key === section_key || (m.match_strength && String(m.match_strength).toUpperCase() === 'MISSING'));
    } else {
      // If section is unknown, fall back to rescoring previously MISSING only
      affectedBase = affectedBase.filter(m => m.match_strength && String(m.match_strength).toUpperCase() === 'MISSING');
    }
    const affected = affectedBase.map(m => ({ requirement_id: m.requirement_id || m.requirementId || m.id, previous: m.match_strength || 'MISSING' }));

    if (!affected.length) {
      console.log('ℹ️ [LLM ATS] No affected requirements for this section change');
      return res.status(200).json({ status: 'success', message: 'No affected requirements', data: { updated_mappings: [], score_delta: 0, new_overall_score: baselineScore } });
    }

    let analyzerConfig = await getUserLLMConfig(userId, 'analyzer');
    if (!analyzerConfig) {
      if (process.env.LLM_STUB === 'true') {
        analyzerConfig = { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'stub' };
      } else {
        return res.status(400).json({ status: 'error', message: 'LLM analyzer configuration not found. Configure in Settings.' });
      }
    }

    const tRescoreStart = Date.now();
    const inc = await incrementalRescoreLLM({
      affectedMappings: affected,
      beforeText: before_text,
      afterText: after_text,
      baselineScore,
    }, analyzerConfig);
    const tRescoreMs = Date.now() - tRescoreStart;

    // Merge updates
    const updated = new Map();
    for (const um of inc.updated_mappings || []) {
      updated.set(um.requirement_id, um.match_strength || um.matchStrength);
    }

    baseline.mappings = (baseline.mappings || []).map(m => {
      const rid = m.requirement_id || m.requirementId || m.id;
      if (updated.has(rid)) {
        return { ...m, match_strength: updated.get(rid) };
      }
      return m;
    });

    baseline.overall_score = inc.new_overall_score;
    baseline.updated_at = new Date().toISOString();
    ats.llm = baseline;
    ats.ats_score = inc.new_overall_score; // convenience mirror
    const prevUsage2 = Array.isArray(ats.llm_usage) ? ats.llm_usage : [];
    ats.llm_usage = [
      ...prevUsage2,
      {
        ts: new Date().toISOString(),
        phase: 'rescore',
        provider: analyzerConfig.provider,
        model: analyzerConfig.model || null,
        latency_ms: tRescoreMs,
        stub: process.env.LLM_STUB === 'true'
      }
    ];

    await pool.query(
      'UPDATE resumes SET ats_analysis = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(ats), resumeId]
    );

    return res.status(200).json({ status: 'success', message: 'LLM ATS re-scored', data: inc });
  } catch (error) {
    console.error('❌ [LLM ATS] Rescore error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to re-score LLM ATS', error: error.message });
  }
});

/**
 * GET /api/ats/llm/usage?resumeId=123
 * Returns summarized LLM usage for ATS operations
 */
router.get('/llm/usage', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const resumeId = req.query.resumeId ? parseInt(req.query.resumeId, 10) : null;

    // Ensure ats_analysis column exists; otherwise skip with empty usage (older DBs)
    const existsCol = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns 
         WHERE table_name = 'resumes' AND column_name = 'ats_analysis'
       ) AS exists`
    );
    const hasAtsAnalysis = Boolean(existsCol?.rows?.[0]?.exists);
    if (!hasAtsAnalysis) {
      return res.status(200).json({ status: 'success', data: { usage: [], totals: { total_calls: 0, analysis_calls: 0, rescore_calls: 0, total_latency_ms: 0, stub_calls: 0 } } });
    }

    let result;
    if (resumeId) {
      result = await pool.query(
        'SELECT id, ats_analysis FROM resumes WHERE id = $1 AND user_id = $2',
        [resumeId, userId]
      );
    } else {
      result = await pool.query(
        'SELECT id, ats_analysis FROM resumes WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1',
        [userId]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Resume not found' });
    }

    let ats = null;
    try { ats = result.rows[0].ats_analysis ? JSON.parse(result.rows[0].ats_analysis) : null; } catch { ats = null; }
    const usage = Array.isArray(ats?.llm_usage) ? ats.llm_usage : [];
    const totals = usage.reduce((acc, u) => {
      acc.total_calls += 1;
      acc.total_latency_ms += typeof u.latency_ms === 'number' ? u.latency_ms : 0;
      if (u.phase && String(u.phase).startsWith('analysis')) acc.analysis_calls += 1;
      if (u.phase === 'rescore') acc.rescore_calls += 1;
      if (u.stub) acc.stub_calls += 1;
      return acc;
    }, { total_calls: 0, analysis_calls: 0, rescore_calls: 0, total_latency_ms: 0, stub_calls: 0 });

    return res.status(200).json({ status: 'success', data: { usage, totals } });
  } catch (error) {
    console.error('❌ [LLM ATS] Usage error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch LLM usage', error: error.message });
  }
});

export default router;
