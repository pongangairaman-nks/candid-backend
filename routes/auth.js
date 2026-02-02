import express from 'express';
import {
  signupUser,
  loginUser,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
  getUserById,
  updateUserProfile,
} from '../services/authService.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// POST /api/auth/signup - Register a new user
router.post('/signup', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Email and password are required',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 8 characters long',
      });
    }

    const result = await signupUser(email, password, firstName || '', lastName || '');

    res.status(201).json({
      status: 'success',
      message: 'User registered successfully',
      data: {
        user: result.user,
        token: result.token,
      },
    });
  } catch (error) {
    console.error('Signup error:', error.message);
    res.status(400).json({
      status: 'error',
      message: error.message,
    });
  }
});

// POST /api/auth/login - Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Email and password are required',
      });
    }

    const result = await loginUser(email, password);

    res.status(200).json({
      status: 'success',
      message: 'Login successful',
      data: {
        user: result.user,
        token: result.token,
      },
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(401).json({
      status: 'error',
      message: error.message,
    });
  }
});

// POST /api/auth/forgot-password - Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    // Validate input
    if (!email) {
      return res.status(400).json({
        status: 'error',
        message: 'Email is required',
      });
    }

    const result = await requestPasswordReset(email);

    res.status(200).json({
      status: 'success',
      message: result.message,
      data: {
        resetToken: result.resetToken, // In production, send via email
      },
    });
  } catch (error) {
    console.error('Forgot password error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to process password reset request',
    });
  }
});

// POST /api/auth/reset-password - Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    // Validate input
    if (!resetToken || !newPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'Reset token and new password are required',
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 8 characters long',
      });
    }

    const result = await resetPassword(resetToken, newPassword);

    res.status(200).json({
      status: 'success',
      message: result.message,
    });
  } catch (error) {
    console.error('Reset password error:', error.message);
    res.status(400).json({
      status: 'error',
      message: error.message,
    });
  }
});

// POST /api/auth/verify-email - Verify email with token
router.post('/verify-email', async (req, res) => {
  try {
    const { verificationToken } = req.body;

    // Validate input
    if (!verificationToken) {
      return res.status(400).json({
        status: 'error',
        message: 'Verification token is required',
      });
    }

    const result = await verifyEmail(verificationToken);

    res.status(200).json({
      status: 'success',
      message: result.message,
    });
  } catch (error) {
    console.error('Verify email error:', error.message);
    res.status(400).json({
      status: 'error',
      message: error.message,
    });
  }
});

// GET /api/auth/me - Get current user (protected route)
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { user },
    });
  } catch (error) {
    console.error('Get user error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch user',
    });
  }
});

// PUT /api/auth/profile - Update user profile (protected route)
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { firstName, lastName } = req.body;

    const user = await updateUserProfile(req.user.id, firstName, lastName);

    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: { user },
    });
  } catch (error) {
    console.error('Update profile error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update profile',
    });
  }
});

export default router;
