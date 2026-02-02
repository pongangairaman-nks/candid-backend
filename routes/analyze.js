import express from 'express';
import pool from '../config/database.js';
import { analyzeJobDescription } from '../services/geminiService.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// POST /api/analyze - Analyze job description using Gemini
router.post('/analyze', authenticateToken, async (req, res) => {
    try {
        const { resumeId, jobDescription } = req.body;
        const userId = req.user.id;

        // Validate input
        if (!jobDescription) {
            return res.status(400).json({
                status: 'error',
                message: 'jobDescription is required'
            });
        }

        console.log(`📊 Analyzing job description for user ID: ${userId}`);

        // Fetch the user's first resume (master template)
        const resumeResult = await pool.query(
            'SELECT id, master_resume_text FROM resumes WHERE user_id = $1 ORDER BY id ASC LIMIT 1',
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

        const resumeText = resume.master_resume_text;

        if (!resumeText) {
            return res.status(400).json({
                status: 'error',
                message: 'Resume text not found. Please save a master template first.'
            });
        }

        // Analyze using Gemini
        console.log('🤖 Calling Gemini API...');
        const analysis = await analyzeJobDescription(jobDescription, resumeText);

        // Update database with analysis and job description
        await pool.query(
            `UPDATE resumes 
       SET job_description = $1, analysis_json = $2, updated_at = NOW()
       WHERE id = $3`,
            [jobDescription, JSON.stringify(analysis), actualResumeId]
        );

        console.log('✅ Analysis saved to database');

        res.status(200).json({
            status: 'success',
            message: 'Job description analyzed successfully',
            data: {
                resumeId: actualResumeId,
                analysis: {
                    keywords: analysis.keywords,
                    missing_skills: analysis.missing_skills,
                    role_focus: analysis.role_focus
                },
                stats: {
                    keywordsCount: analysis.keywords.length,
                    missingSkillsCount: analysis.missing_skills.length,
                    jdLength: jobDescription.length
                }
            }
        });

    } catch (error) {
        console.error('❌ Analysis error:', error.message);

        res.status(500).json({
            status: 'error',
            message: 'Failed to analyze job description',
            error: error.message
        });
    }
});

export default router;
