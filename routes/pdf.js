import express from 'express';
import fs from 'fs';
import path from 'path';
import pool from '../config/database.js';
import { generateAndUploadPDF, compileLatexToPDF } from '../services/pdfService.js';

const router = express.Router();

// POST /api/generate-pdf - Compile LaTeX to PDF and return preview URL
router.post('/generate-pdf', async (req, res) => {
    try {
        const { resumeId } = req.body;

        // Validate input
        if (!resumeId) {
            return res.status(400).json({
                status: 'error',
                message: 'resumeId is required'
            });
        }

        console.log(`📄 Generating PDF for resume ID: ${resumeId}`);

        // Fetch tailored LaTeX from database
        const resumeResult = await pool.query(
            'SELECT tailored_latex FROM resumes WHERE id = $1',
            [resumeId]
        );

        if (resumeResult.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: `Resume with ID ${resumeId} not found`
            });
        }

        const tailoredLatex = resumeResult.rows[0].tailored_latex;

        if (!tailoredLatex) {
            return res.status(400).json({
                status: 'error',
                message: 'Tailored LaTeX not found. Please run /generate-resume first.'
            });
        }

        console.log('🔨 Compiling LaTeX to PDF...');

        // Generate PDF and upload to Firebase
        const { pdfUrl } = await generateAndUploadPDF(tailoredLatex, resumeId);

        // Save PDF URL to database
        await pool.query(
            `UPDATE resumes 
       SET pdf_url = $1, updated_at = NOW()
       WHERE id = $2`,
            [pdfUrl, resumeId]
        );

        console.log('✅ PDF generation complete');

        res.status(200).json({
            status: 'success',
            message: 'PDF generated successfully',
            data: {
                resumeId,
                pdfUrl,
                previewUrl: pdfUrl, // Can be used directly in iframe or download
                downloadUrl: pdfUrl
            }
        });

    } catch (error) {
        console.error('❌ PDF generation error:', error.message);

        // Provide helpful error messages
        let errorMessage = 'Failed to generate PDF';
        if (error.message.includes('pdflatex')) {
            errorMessage = 'LaTeX compiler not found. Please ensure pdflatex is installed.';
        } else if (error.message.includes('compile')) {
            errorMessage = 'LaTeX compilation failed. There may be syntax errors in the template.';
        }

        res.status(500).json({
            status: 'error',
            message: errorMessage,
            error: error.message
        });
    }
});

// POST /api/compile-latex - Compile LaTeX directly and return PDF blob
router.post('/compile-latex', async (req, res) => {
    try {
        const { latexCode } = req.body;

        // Validate input
        if (!latexCode) {
            return res.status(400).json({
                status: 'error',
                message: 'latexCode is required'
            });
        }

        console.log('🔨 Compiling LaTeX to PDF for preview...');

        // Compile LaTeX to PDF
        const pdfPath = await compileLatexToPDF(latexCode, `preview-${Date.now()}`);

        // Read the PDF file
        const pdfBuffer = fs.readFileSync(pdfPath);

        // Clean up the PDF file after reading
        try {
            fs.unlinkSync(pdfPath);
        } catch (error) {
            console.warn('Warning: Could not delete temporary PDF file');
        }

        // Send PDF as binary data
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="resume.pdf"');
        res.send(pdfBuffer);

    } catch (error) {
        console.error('❌ LaTeX compilation error:', error.message);
        console.error('Full error:', error);

        // Provide helpful error messages
        let errorMessage = 'Failed to compile LaTeX';
        if (error.message.includes('pdflatex') || error.message.includes('ENOENT') || error.message.includes('not found')) {
            errorMessage = 'LaTeX compiler (pdflatex) is not installed on this system. To use preview, please install TeX Live or MiKTeX.';
        } else if (error.message.includes('compile') || error.message.includes('Error')) {
            errorMessage = 'LaTeX compilation failed. There may be syntax errors in your resume template. Please check the LaTeX code.';
        } else if (error.message.includes('timeout')) {
            errorMessage = 'LaTeX compilation timed out. The document may be too complex.';
        }

        res.status(500).json({
            status: 'error',
            message: errorMessage,
            error: error.message,
            details: 'pdflatex not found - install TeX Live (Linux/Mac) or MiKTeX (Windows) to enable PDF preview'
        });
    }
});

// GET /api/resume/:id - Get resume data and PDF URL
router.get('/resume/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `SELECT id, pdf_url, created_at, updated_at 
       FROM resumes WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Resume not found'
            });
        }

        const resume = result.rows[0];

        res.status(200).json({
            status: 'success',
            data: {
                resumeId: resume.id,
                pdfUrl: resume.pdf_url,
                createdAt: resume.created_at,
                updatedAt: resume.updated_at,
                hasPDF: !!resume.pdf_url
            }
        });

    } catch (error) {
        console.error('❌ Fetch error:', error.message);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch resume data',
            error: error.message
        });
    }
});

export default router;
