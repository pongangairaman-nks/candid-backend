import express from 'express';
import pool from '../config/database.js';

const router = express.Router();

// Health check endpoint
router.get('/ping', async (req, res) => {
    try {
        // Test database connection
        const dbResult = await pool.query('SELECT NOW()');

        res.status(200).json({
            status: 'success',
            message: 'Server is running',
            timestamp: new Date().toISOString(),
            database: {
                connected: true,
                timestamp: dbResult.rows[0].now
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Server is running but database connection failed',
            error: error.message,
            timestamp: new Date().toISOString(),
            database: {
                connected: false
            }
        });
    }
});

export default router;
