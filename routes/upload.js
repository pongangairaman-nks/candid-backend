import express from 'express';
import path from 'path';
import pool from '../config/database.js';
import { uploadFields } from '../middleware/upload.js';
import {
    extractTextFromPDF,
    readLatexFile,
    uploadToFirebase,
    cleanupTempFile,
    validateFileType
} from '../services/fileService.js';

const router = express.Router();

// POST /api/upload - Upload LaTeX template and master resume PDF
router.post('/upload', uploadFields, async (req, res) => {
    let latexFilePath = null;
    let pdfFilePath = null;

    try {
        // Check if files were uploaded
        if (!req.files || !req.files.latexFile || !req.files.resumePDF) {
            return res.status(400).json({
                status: 'error',
                message: 'Both LaTeX file and resume PDF are required',
                received: {
                    latexFile: !!req.files?.latexFile,
                    resumePDF: !!req.files?.resumePDF
                }
            });
        }

        const latexFile = req.files.latexFile[0];
        const resumePDF = req.files.resumePDF[0];

        latexFilePath = latexFile.path;
        pdfFilePath = resumePDF.path;

        console.log('📄 Processing uploaded files...');
        console.log(`  LaTeX: ${latexFile.originalname}`);
        console.log(`  PDF: ${resumePDF.originalname}`);

        // Validate file types
        if (!validateFileType(latexFile.originalname, ['.tex'])) {
            throw new Error('LaTeX file must have .tex extension');
        }
        if (!validateFileType(resumePDF.originalname, ['.pdf'])) {
            throw new Error('Resume file must have .pdf extension');
        }

        // Read LaTeX template content
        console.log('📖 Reading LaTeX template...');
        const latexContent = readLatexFile(latexFilePath);

        // Extract text from PDF
        console.log('📖 Extracting text from PDF...');
        const resumeText = await extractTextFromPDF(pdfFilePath);

        // Upload files to Firebase Storage
        console.log('☁️  Uploading to Firebase Storage...');
        const timestamp = Date.now();
        const latexRemotePath = `latex-templates/${timestamp}-${latexFile.originalname}`;
        const pdfRemotePath = `master-resumes/${timestamp}-${resumePDF.originalname}`;

        const [latexUrl, pdfUrl] = await Promise.all([
            uploadToFirebase(latexFilePath, latexRemotePath),
            uploadToFirebase(pdfFilePath, pdfRemotePath)
        ]);

        // Save to database
        console.log('💾 Saving to database...');
        const result = await pool.query(
            `INSERT INTO resumes (original_latex, master_resume_text, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       RETURNING id`,
            [latexContent, resumeText]
        );

        const resumeId = result.rows[0].id;

        // Save file metadata
        await pool.query(
            `INSERT INTO files (resume_id, file_type, file_name, file_url, created_at)
       VALUES ($1, $2, $3, $4, NOW()), ($5, $6, $7, $8, NOW())`,
            [
                resumeId, 'latex', latexFile.originalname, latexUrl,
                resumeId, 'pdf', resumePDF.originalname, pdfUrl
            ]
        );

        // Clean up temporary files
        cleanupTempFile(latexFilePath);
        cleanupTempFile(pdfFilePath);

        console.log('✅ Upload complete!');

        res.status(200).json({
            status: 'success',
            message: 'Files uploaded and processed successfully',
            data: {
                resumeId,
                files: {
                    latex: {
                        name: latexFile.originalname,
                        url: latexUrl,
                        size: latexFile.size
                    },
                    pdf: {
                        name: resumePDF.originalname,
                        url: pdfUrl,
                        size: resumePDF.size
                    }
                },
                extracted: {
                    latexLength: latexContent?.length || 0,
                    resumeTextLength: resumeText?.length || 0,
                    resumeTextPreview: resumeText?.substring(0, 200) + '...'
                }
            }
        });

    } catch (error) {
        console.error('❌ Upload error:', error.message);

        // Clean up files on error
        if (latexFilePath) cleanupTempFile(latexFilePath);
        if (pdfFilePath) cleanupTempFile(pdfFilePath);

        res.status(500).json({
            status: 'error',
            message: 'Failed to process uploaded files',
            error: error.message
        });
    }
});

export default router;
