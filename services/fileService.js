import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import { uploadFile } from '../config/firebase.js';

// Extract text from PDF file
export const extractTextFromPDF = async (filePath) => {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text;
    } catch (error) {
        console.error('PDF extraction error:', error.message);
        throw new Error('Failed to extract text from PDF');
    }
};

// Read LaTeX file content
export const readLatexFile = (filePath) => {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return content;
    } catch (error) {
        console.error('LaTeX read error:', error.message);
        throw new Error('Failed to read LaTeX file');
    }
};

// Upload file to Firebase and return URL
export const uploadToFirebase = async (localPath, remotePath) => {
    try {
        const url = await uploadFile(localPath, remotePath);
        return url;
    } catch (error) {
        console.error('Firebase upload error:', error.message);
        throw new Error('Failed to upload file to Firebase');
    }
};

// Clean up local temporary files
export const cleanupTempFile = (filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️  Cleaned up temp file: ${path.basename(filePath)}`);
        }
    } catch (error) {
        console.error('Cleanup error:', error.message);
    }
};

// Validate file type
export const validateFileType = (filename, allowedExtensions) => {
    const ext = path.extname(filename).toLowerCase();
    return allowedExtensions.includes(ext);
};
