import express from 'express';
import pool from '../config/database.js';
import { tailorResumeContent } from '../services/claudeService.js';

const router = express.Router();

// POST /api/generate-resume - Generate tailored resume using Claude
router.post('/generate-resume', async (req, res) => {
    try {
        const { resumeId } = req.body;

        // Validate input
        if (!resumeId) {
            return res.status(400).json({
                status: 'error',
                message: 'resumeId is required'
            });
        }

        console.log(`📝 Generating tailored resume for ID: ${resumeId}`);

        // Fetch all required data from database
        const resumeResult = await pool.query(
            `SELECT original_latex, master_resume_text, job_description, analysis_json 
       FROM resumes WHERE id = $1`,
            [resumeId]
        );

        if (resumeResult.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: `Resume with ID ${resumeId} not found`
            });
        }

        const resume = resumeResult.rows[0];

        // Validate required data
        if (!resume.original_latex) {
            return res.status(400).json({
                status: 'error',
                message: 'Original LaTeX template not found. Please upload files first.'
            });
        }

        if (!resume.job_description || !resume.analysis_json) {
            return res.status(400).json({
                status: 'error',
                message: 'Job description analysis not found. Please run /analyze first.'
            });
        }

        const analysis = resume.analysis_json;

        console.log('📊 Using analysis:');
        console.log(`  Keywords: ${analysis.keywords.length}`);
        console.log(`  Missing skills: ${analysis.missing_skills.length}`);
        console.log(`  Role focus: ${analysis.role_focus.substring(0, 50)}...`);

        // Call Claude to tailor the resume
        console.log('🤖 Calling Claude for content tailoring...');
        const tailoredLatex = await tailorResumeContent(
            resume.original_latex,
            analysis,
            resume.master_resume_text,
            resume.job_description
        );

        // Save tailored LaTeX to database
        await pool.query(
            `UPDATE resumes 
       SET tailored_latex = $1, updated_at = NOW()
       WHERE id = $2`,
            [tailoredLatex, resumeId]
        );

        console.log('✅ Tailored resume saved to database');

        res.status(200).json({
            status: 'success',
            message: 'Resume tailored successfully',
            data: {
                resumeId,
                latex: tailoredLatex,
                stats: {
                    originalLength: resume.original_latex.length,
                    tailoredLength: tailoredLatex.length,
                    keywordsUsed: analysis.keywords.length,
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
