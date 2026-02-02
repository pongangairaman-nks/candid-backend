import express from 'express';
import pool from '../config/database.js';
import { analyzeJobDescription } from '../services/geminiService.js';

const router = express.Router();

// POST /api/analyze - Analyze job description using Gemini
router.post('/analyze', async (req, res) => {
    try {
        const { resumeId, jobDescription } = req.body;

        // Validate input
        if (!resumeId || !jobDescription) {
            return res.status(400).json({
                status: 'error',
                message: 'Both resumeId and jobDescription are required',
                received: {
                    resumeId: !!resumeId,
                    jobDescription: !!jobDescription
                }
            });
        }

        console.log(`📊 Analyzing job description for resume ID: ${resumeId}`);

        // Fetch resume data from database
        const resumeResult = await pool.query(
            'SELECT master_resume_text FROM resumes WHERE id = $1',
            [resumeId]
        );

        if (resumeResult.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: `Resume with ID ${resumeId} not found`
            });
        }

        const resumeText = resumeResult.rows[0].master_resume_text;

        if (!resumeText) {
            return res.status(400).json({
                status: 'error',
                message: 'Resume text not found. Please upload resume files first.'
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
            [jobDescription, JSON.stringify(analysis), resumeId]
        );

        console.log('✅ Analysis saved to database');

        res.status(200).json({
            status: 'success',
            message: 'Job description analyzed successfully',
            data: {
                resumeId,
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
