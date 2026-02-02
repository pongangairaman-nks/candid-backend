import express from 'express';
import pool from '../config/database.js';
import { tailorResumeContent } from '../services/claudeService.js';
import { authenticateToken } from '../middleware/auth.js';
import { getUserLLMConfig } from './llmConfig.js';

const router = express.Router();

// POST /api/generate-resume - Generate tailored resume using Claude
router.post('/generate-resume', authenticateToken, async (req, res) => {
    try {
        const { resumeId } = req.body;
        const userId = req.user.id;

        console.log(`📝 Generating tailored resume for user ID: ${userId}`);

        // Fetch the user's first resume (master template)
        const resumeResult = await pool.query(
            `SELECT id, original_latex, master_resume_text, job_description, analysis_json 
       FROM resumes WHERE user_id = $1 ORDER BY id ASC LIMIT 1`,
            [userId]
        );

        if (resumeResult.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'No resume found for user. Please save a master template first.'
            });
        }

        const resume = resumeResult.rows[0];
        const actualResumeId = resume.id;

        // Validate required data
        if (!resume.original_latex) {
            return res.status(400).json({
                status: 'error',
                message: 'Original LaTeX template not found. Please save a master template first.'
            });
        }

        if (!resume.job_description || !resume.analysis_json) {
            return res.status(400).json({
                status: 'error',
                message: 'Job description analysis not found. Please run /analyze first.'
            });
        }

        let analysis = resume.analysis_json;
        
        // Parse analysis if it's a string
        if (typeof analysis === 'string') {
            try {
                analysis = JSON.parse(analysis);
            } catch (parseError) {
                console.error('Failed to parse analysis_json:', parseError);
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

        console.log('📊 Using analysis:');
        console.log(`  Primary keywords: ${analysis.primary_keywords?.length || analysis.keywords?.length || 0}`);
        console.log(`  Missing skills: ${analysis.missing_skills?.length || 0}`);
        console.log(`  Role focus: ${analysis.role_focus?.substring(0, 50) || 'N/A'}...`);

        // Get user's LLM configuration (required) - get both generator and analyzer for fallback
        const fullConfig = await getUserLLMConfig(userId, 'both');
        if (!fullConfig || !fullConfig.generator) {
            return res.status(400).json({
                status: 'error',
                message: 'LLM configuration not found. Please configure your LLM provider and API key in the Configuration page.'
            });
        }

        console.log(`🔧 Using generator: ${fullConfig.generator.provider} - ${fullConfig.generator.model}`);

        // Prepare config for tailorResumeContent with both generator and analyzer info
        const userConfig = {
            provider: fullConfig.generator.provider,
            model: fullConfig.generator.model,
            apiKey: fullConfig.generator.apiKey,
            analyzer_provider: fullConfig.analyzer.provider,
            analyzer_model: fullConfig.analyzer.model,
            analyzer_api_key: fullConfig.analyzer.apiKey,
            master_content: fullConfig.generator.masterContent
        };

        // Call LLM to tailor the resume
        console.log('🤖 Calling LLM for content tailoring...');
        const tailoredLatex = await tailorResumeContent(
            resume.original_latex,
            analysis,
            resume.master_resume_text,
            resume.job_description,
            userConfig
        );

        // Save tailored LaTeX to database
        await pool.query(
            `UPDATE resumes 
       SET tailored_latex = $1, updated_at = NOW()
       WHERE id = $2`,
            [tailoredLatex, actualResumeId]
        );

        console.log('✅ Tailored resume saved to database');

        res.status(200).json({
            status: 'success',
            message: 'Resume tailored successfully',
            data: {
                resumeId: actualResumeId,
                latex: tailoredLatex,
                stats: {
                    originalLength: resume.original_latex.length,
                    tailoredLength: tailoredLatex.length,
                    keywordsUsed: (analysis.primary_keywords || analysis.keywords || []).length,
                    structurePreserved: tailoredLatex.includes('\\documentclass')
                }
            }
        });

    } catch (error) {
        console.error('❌ Resume generation error:', error.message);

        res.status(500).json({
            status: 'error',
            message: 'Failed to generate tailored resume',
            error: error.message
        });
    }
});

export default router;
