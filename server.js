import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testConnection, initDatabase } from './config/database.js';
import initFirebase from './config/firebase.js';
import { initializeFeatureFlagsTable } from './services/featureFlags.js';
import logger from './services/logger.js';
import healthRouter from './routes/health.js';
import uploadRouter from './routes/upload.js';
import analyzeRouter from './routes/analyze.js';
import generateRouter from './routes/generate.js';
import pdfRouter from './routes/pdf.js';
import authRouter from './routes/auth.js';
import resumeRouter from './routes/resume.js';
import refineSectionRouter from './routes/refineSection.js';
import llmConfigRouter from './routes/llmConfig.js';
import atsRouter from './routes/atsAnalysis.js';
import jobApplicationsRouter from './routes/jobApplications.js';
import featureFlagsRouter from './routes/featureFlags.js';
import llmUsageRouter from './routes/llmUsage.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request timing and logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });

  next();
});

// Routes
app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/resume', resumeRouter);
app.use('/api/resume', refineSectionRouter);
app.use('/api/llm', llmConfigRouter);
app.use('/api/ats', atsRouter);
app.use('/api/job-applications', jobApplicationsRouter);
app.use('/api/feature-flags', featureFlagsRouter);
app.use('/api/llm-usage', llmUsageRouter);
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
  logger.error('Server error:', { error: err.message, stack: err.stack });
    res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Initialize and start server
const startServer = async () => {
    try {
        logger.info('🚀 Starting AI Resume Tailoring Platform...\n');

        // Test database connection first with timeout
        logger.info('📊 Testing database connection...');
        try {
            const connectionPromise = testConnection();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Database connection timeout')), 10000)
            );
            await Promise.race([connectionPromise, timeoutPromise]);
        } catch (dbError) {
            logger.warn('⚠️ Database connection failed, continuing anyway:', { error: dbError.message });
        }

        // Initialize database tables with timeout
        logger.info('📊 Initializing database tables...');
        try {
            const initPromise = initDatabase();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Database initialization timeout')), 15000)
            );
            await Promise.race([initPromise, timeoutPromise]);
        } catch (dbError) {
            logger.warn('⚠️ Database initialization failed, continuing anyway:', { error: dbError.message });
        }

        // Initialize feature flags with timeout
        logger.info('� Initializing feature flags...');
        try {
            const flagsPromise = initializeFeatureFlagsTable();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Feature flags initialization timeout')), 5000)
            );
            await Promise.race([flagsPromise, timeoutPromise]);
        } catch (error) {
            logger.warn('⚠️ Feature flags initialization failed, continuing anyway:', { error: error.message });
        }

        // Initialize Firebase
        logger.info('🔥 Initializing Firebase...');
        try {
            initFirebase();
        } catch (error) {
            logger.warn('⚠️ Firebase initialization failed:', { error: error.message });
        }

        // Start Express server after initialization attempts
        app.listen(PORT, () => {
            logger.info(`✅ Server running on http://localhost:${PORT}`);
            logger.info(`✅ Health check: http://localhost:${PORT}/api/ping\n`);
            logger.info('✅ All services initialized');
        });
    } catch (error) {
        logger.error('❌ Failed to start server:', { error: error.message });
        process.exit(1);
    }
};

startServer();

