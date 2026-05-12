/**
 * Resume V2 Routes
 * 
 * New architecture endpoints:
 * - POST /api/v2/resume/upload-master - Upload LaTeX, extract JSON, create template
 * - GET /api/v2/resume/master - Fetch master resume (JSON + template)
 * - POST /api/v2/resume/analyze - Analyze resume against JD
 * - POST /api/v2/resume/optimize-to-target - Iteratively optimize resume
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { extractJsonFromLatex, convertLatexToTemplate } = require('../services/resumeParserService');
const { renderLatex, validateLatex } = require('../services/resumeRenderService');
const { analyzeResumeWithLLM } = require('../services/atsAnalysisV2Service');
const { optimizeUntilTarget } = require('../services/iterativeOptimizationService');
const { getUserLLMConfig } = require('../services/llmConfigService');
const { logTokenUsage } = require('../services/tokenTrackingService');

/**
 * POST /api/v2/resume/upload-master
 * Upload LaTeX resume, extract JSON, create template
 * Stores: whole_master_template, extracted_content_json, created_latex_template
 */
router.post('/upload-master', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { latexContent } = req.body;

    if (!latexContent || latexContent.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'LaTeX content is required'
      });
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📤 Uploading master resume for user ${userId}`);
    console.log(`${'='.repeat(60)}\n`);

    // Get user's LLM config for extraction
    const userConfig = await getUserLLMConfig(userId, 'generator');
    if (!userConfig) {
      return res.status(400).json({
        status: 'error',
        message: 'Please configure LLM settings first'
      });
    }

    // Step 1: Extract JSON from LaTeX
    console.log('1️⃣ Extracting JSON from LaTeX...');
    const extractedContentJson = await extractJsonFromLatex(latexContent, userConfig);

    // Step 2: Convert LaTeX to Handlebars template
    console.log('2️⃣ Converting LaTeX to Handlebars template...');
    const createdLatexTemplate = await convertLatexToTemplate(latexContent, extractedContentJson);

    // Step 3: Validate template by rendering
    console.log('3️⃣ Validating template...');
    const testRender = renderLatex(createdLatexTemplate, extractedContentJson);
    const validation = validateLatex(testRender);
    if (!validation.isValid) {
      console.error('❌ Template validation failed:', validation.errors);
      return res.status(400).json({
        status: 'error',
        message: 'Template validation failed',
        errors: validation.errors
      });
    }

    // Step 4: Store in database
    console.log('4️⃣ Storing in database...');
    const result = await pool.query(
      `INSERT INTO resumes (user_id, whole_master_template, extracted_content_json, created_latex_template, template_version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         whole_master_template = $2,
         extracted_content_json = $3,
         created_latex_template = $4,
         template_version = $5,
         updated_at = NOW()
       RETURNING id`,
      [userId, latexContent, JSON.stringify(extractedContentJson), createdLatexTemplate, '1.0']
    );

    const resumeId = result.rows[0].id;

    console.log(`✅ Master resume uploaded successfully (ID: ${resumeId})\n`);

    res.status(200).json({
      status: 'success',
      message: 'Master resume uploaded and processed successfully',
      data: {
        resumeId,
        whole_master_template: latexContent,
        extracted_content_json: extractedContentJson,
        created_latex_template: createdLatexTemplate
      }
    });
  } catch (error) {
    console.error('❌ Upload error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to upload master resume',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/v2/resume/master
 * Fetch master resume (JSON + template) for optimization screen
 */
router.get('/master', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    console.log(`📥 Fetching master resume for user ${userId}`);

    const result = await pool.query(
      `SELECT extracted_content_json, created_latex_template
       FROM resumes
       WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'No master resume found. Please upload one first.'
      });
    }

    const resume = result.rows[0];
    const extractedContentJson = typeof resume.extracted_content_json === 'string'
      ? JSON.parse(resume.extracted_content_json)
      : resume.extracted_content_json;

    console.log('✅ Master resume fetched successfully');

    res.status(200).json({
      status: 'success',
      data: {
        extracted_content_json: extractedContentJson,
        created_latex_template: resume.created_latex_template
      }
    });
  } catch (error) {
    console.error('❌ Fetch error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch master resume',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/v2/resume/render
 * Render LaTeX from template + JSON (for testing)
 */
router.post('/render', authenticateToken, async (req, res) => {
  try {
    const { contentJson, template } = req.body;

    if (!contentJson || !template) {
      return res.status(400).json({
        status: 'error',
        message: 'contentJson and template are required'
      });
    }

    console.log('🔄 Rendering LaTeX...');

    const latex = renderLatex(template, contentJson);

    console.log('✅ LaTeX rendered successfully');

    res.status(200).json({
      status: 'success',
      data: {
        latex
      }
    });
  } catch (error) {
    console.error('❌ Render error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to render LaTeX',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/v2/resume/analyze
 * Analyze resume against JD, return ATS score + weak sections
 */
router.post('/analyze', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobDescription, extractedContentJson } = req.body;

    if (!jobDescription || !extractedContentJson) {
      return res.status(400).json({
        status: 'error',
        message: 'jobDescription and extractedContentJson are required'
      });
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 Analyzing resume for user ${userId}`);
    console.log(`${'='.repeat(60)}\n`);

    // Get user's analyzer config
    const userConfig = await getUserLLMConfig(userId, 'analyzer');
    if (!userConfig) {
      return res.status(400).json({
        status: 'error',
        message: 'Please configure LLM settings first'
      });
    }

    // Analyze resume with LLM
    console.log('📊 Running ATS analysis...');
    const atsAnalysis = await analyzeResumeWithLLM(
      jobDescription,
      extractedContentJson,
      userConfig
    );

    // Log token usage (estimate: ~1000 input, ~500 output for analysis)
    try {
      await logTokenUsage({
        userId,
        phase: 'analysis',
        model: userConfig.model,
        inputTokens: 1000,
        outputTokens: 500
      });
    } catch (logError) {
      console.warn('⚠️ Failed to log token usage:', logError.message);
    }

    // Store analysis in database
    await pool.query(
      `UPDATE resumes
       SET ats_analysis = $1, updated_at = NOW()
       WHERE user_id = $2`,
      [JSON.stringify(atsAnalysis), userId]
    );

    console.log(`✅ Analysis complete (Score: ${atsAnalysis.ats_score}/100)\n`);

    res.status(200).json({
      status: 'success',
      data: {
        ats_score: atsAnalysis.ats_score,
        analysis: atsAnalysis.analysis,
        weak_sections: atsAnalysis.weak_sections,
        missing_keywords: atsAnalysis.missing_keywords,
        optimization_priority: atsAnalysis.optimization_priority
      }
    });
  } catch (error) {
    console.error('❌ Analysis error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to analyze resume',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/v2/resume/optimize-to-target
 * Iteratively optimize resume until 80-90+ ATS score
 */
router.post('/optimize-to-target', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { extractedContentJson, jobDescription, targetScore = 90 } = req.body;

    if (!extractedContentJson || !jobDescription) {
      return res.status(400).json({
        status: 'error',
        message: 'extractedContentJson and jobDescription are required'
      });
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 Starting iterative optimization for user ${userId}`);
    console.log(`   Target Score: ${targetScore}+`);
    console.log(`${'='.repeat(60)}\n`);

    // Get user config
    const userConfig = await getUserLLMConfig(userId, 'generator');
    if (!userConfig) {
      return res.status(400).json({
        status: 'error',
        message: 'Please configure LLM settings first'
      });
    }

    // Start optimization
    const startTime = Date.now();
    const result = await optimizeUntilTarget(
      extractedContentJson,
      jobDescription,
      userConfig,
      targetScore,
      3 // max iterations
    );
    const duration = Date.now() - startTime;

    // Log token usage for optimization (estimate: ~3000 input, ~2000 output per iteration)
    try {
      const estimatedTokens = result.iterations * 3000; // input tokens
      const estimatedOutput = result.iterations * 2000; // output tokens
      await logTokenUsage({
        userId,
        phase: 'optimization',
        model: userConfig.model,
        inputTokens: estimatedTokens,
        outputTokens: estimatedOutput
      });
    } catch (logError) {
      console.warn('⚠️ Failed to log token usage:', logError.message);
    }

    // Get template from database
    const templateResult = await pool.query(
      `SELECT created_latex_template FROM resumes WHERE user_id = $1`,
      [userId]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Master resume not found. Please upload one first.'
      });
    }

    const template = templateResult.rows[0].created_latex_template;

    // Render final LaTeX
    console.log('📝 Rendering final LaTeX...');
    const finalLatex = renderLatex(template, result.optimized_content_json);

    // Validate LaTeX
    const validation = validateLatex(finalLatex);
    if (!validation.isValid) {
      console.error('❌ Final LaTeX validation failed:', validation.errors);
      return res.status(400).json({
        status: 'error',
        message: 'Final LaTeX validation failed',
        errors: validation.errors
      });
    }

    // Store in database
    await pool.query(
      `UPDATE resumes
       SET optimized_content_json = $1, final_latex = $2, updated_at = NOW()
       WHERE user_id = $3`,
      [JSON.stringify(result.optimized_content_json), finalLatex, userId]
    );

    console.log(`✅ Optimization complete!\n`);

    res.status(200).json({
      status: 'success',
      data: {
        optimized_content_json: result.optimized_content_json,
        final_latex: finalLatex,
        final_ats_score: result.final_ats_score,
        target_reached: result.target_reached,
        iterations: result.iterations,
        optimization_history: result.optimization_history,
        duration_seconds: Math.round(duration / 1000),
        message: result.target_reached
          ? `✅ Reached target score of ${targetScore}+ in ${result.iterations} iterations`
          : `⚠️ Reached ${result.final_ats_score}/100 after ${result.iterations} iterations (plateau detected)`
      }
    });
  } catch (error) {
    console.error('❌ Optimization error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to optimize resume',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
