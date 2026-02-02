import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testConnection, initDatabase } from './config/database.js';
import initFirebase from './config/firebase.js';
import healthRouter from './routes/health.js';
import uploadRouter from './routes/upload.js';
import analyzeRouter from './routes/analyze.js';
import generateRouter from './routes/generate.js';
import pdfRouter from './routes/pdf.js';
import authRouter from './routes/auth.js';
import resumeRouter from './routes/resume.js';
import llmConfigRouter from './routes/llmConfig.js';
import atsRouter from './routes/atsAnalysis.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Routes
app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/resume', resumeRouter);
app.use('/api/llm', llmConfigRouter);
app.use('/api/ats', atsRouter);
app.use('/api', uploadRouter);
app.use('/api', analyzeRouter);
app.use('/api', generateRouter);
app.use('/api', pdfRouter);

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'AI Resume Tailoring Platform API',
        version: '1.0.0',
        endpoints: {
            health: '/api/ping',
            upload: '/api/upload ✅',
            analyze: '/api/analyze ✅',
            generate: '/api/generate-resume ✅',
            pdf: '/api/generate-pdf ✅'
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        status: 'error',
        message: 'Route not found'
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Initialize and start server
const startServer = async () => {
    try {
        console.log('🚀 Starting AI Resume Tailoring Platform...\n');

        // Test database connection
        console.log('📊 Testing database connection...');
        await testConnection();

        // Initialize database tables
        console.log('📊 Initializing database tables...');
        await initDatabase();

        // Initialize Firebase
        console.log('🔥 Initializing Firebase...');
        initFirebase();

        // Start Express server
        app.listen(PORT, () => {
            console.log(`\n✅ Server running on http://localhost:${PORT}`);
            console.log(`✅ Health check: http://localhost:${PORT}/api/ping\n`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
};

startServer();
