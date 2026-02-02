import { verifyToken } from '../services/authService.js';

/**
 * Middleware to authenticate JWT token
 */
export const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Access token is required',
      });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(403).json({
        status: 'error',
        message: 'Invalid or expired token',
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error('Authentication error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Authentication failed',
    });
  }
};

/**
 * Middleware to check if user is authenticated (optional)
 */
export const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        req.user = decoded;
      }
    }

    next();
  } catch (error) {
    console.error('Optional auth error:', error.message);
    next();
  }
};
