import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { uploadFile } from '../config/firebase.js';

const execAsync = promisify(exec);

// Create temp directory for LaTeX compilation
const tempDir = path.join(process.cwd(), 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * Compile LaTeX to PDF using pdflatex
 * @param {string} latexContent - The LaTeX document content
 * @param {string} outputName - Base name for output files (without extension)
 * @returns {Promise<string>} Path to generated PDF file
 */
export const compileLatexToPDF = async (latexContent, outputName = 'resume') => {
    const timestamp = Date.now();
    const uniqueName = `${outputName}-${timestamp}`;
    const texFilePath = path.join(tempDir, `${uniqueName}.tex`);
    const pdfFilePath = path.join(tempDir, `${uniqueName}.pdf`);

    try {
        console.log('📝 Writing LaTeX file...');
        fs.writeFileSync(texFilePath, latexContent, 'utf-8');

        console.log('🔨 Compiling LaTeX to PDF...');

        // Run pdflatex twice to resolve references
        // First pass
        await execAsync(
            `pdflatex -interaction=nonstopmode -output-directory="${tempDir}" "${texFilePath}"`,
            { cwd: tempDir, timeout: 30000 }
        );

        // Second pass (for references, TOC, etc.)
        await execAsync(
            `pdflatex -interaction=nonstopmode -output-directory="${tempDir}" "${texFilePath}"`,
            { cwd: tempDir, timeout: 30000 }
        );

        // Check if PDF was created
        if (!fs.existsSync(pdfFilePath)) {
            throw new Error('PDF file was not generated');
        }

        console.log('✅ PDF compiled successfully');
        return pdfFilePath;

    } catch (error) {
        console.error('❌ LaTeX compilation error:', error.message);

        // Try to read the log file for more details
        const logFilePath = path.join(tempDir, `${uniqueName}.log`);
        if (fs.existsSync(logFilePath)) {
            const logContent = fs.readFileSync(logFilePath, 'utf-8');
            const errorLines = logContent?.split('\n')?.filter(line =>
                line.includes('Error') || line.includes('!')
            ).slice(0, 5);

            if (errorLines?.length > 0) {
                console.error('LaTeX errors:', errorLines.join('\n'));
            }
        }

        throw new Error(`Failed to compile LaTeX: ${error.message}`);
    } finally {
        // Clean up auxiliary files
        cleanupLatexAuxFiles(uniqueName);
    }
};

/**
 * Clean up LaTeX auxiliary files (.aux, .log, .out, etc.)
 * @param {string} baseName - Base name of the files (without extension)
 */
const cleanupLatexAuxFiles = (baseName) => {
    const auxExtensions = ['.aux', '.log', '.out', '.toc', '.tex'];

    auxExtensions?.forEach(ext => {
        const filePath = path.join(tempDir, `${baseName}${ext}`);
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
                console.log(`🗑️  Cleaned up: ${baseName}${ext}`);
            } catch (error) {
                console.warn(`Warning: Could not delete ${filePath}`);
            }
        }
    });
};

/**
 * Generate PDF and upload to Firebase
 * @param {string} latexContent - The LaTeX document content
 * @param {number} resumeId - Resume ID for naming
 * @returns {Promise<Object>} Object with pdfPath and pdfUrl
 */
export const generateAndUploadPDF = async (latexContent, resumeId) => {
    try {
        // Compile LaTeX to PDF
        const pdfPath = await compileLatexToPDF(latexContent, `resume-${resumeId}`);

        // Upload to Firebase
        console.log('☁️  Uploading PDF to Firebase...');
        const remotePath = `generated-resumes/resume-${resumeId}-${Date.now()}.pdf`;
        const pdfUrl = await uploadFile(pdfPath, remotePath);

        console.log('✅ PDF uploaded successfully');
        console.log(`  URL: ${pdfUrl}`);

        return {
            pdfPath,
            pdfUrl
        };

    } catch (error) {
        console.error('❌ PDF generation error:', error.message);
        throw error;
    }
};

/**
 * Check if pdflatex is installed
 */
export const checkLatexInstallation = async () => {
    try {
        await execAsync('pdflatex --version');
        console.log('✅ pdflatex is installed');
        return true;
    } catch (error) {
        console.error('❌ pdflatex is not installed');
        console.error('Please install LaTeX: brew install --cask mactex (macOS)');
        return false;
    }
};
