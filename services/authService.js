import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../config/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';
const RESET_TOKEN_EXPIRE = 3600000; // 1 hour in milliseconds

/**
 * Hash password using bcrypt
 */
export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

/**
 * Compare password with hash
 */
export const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

/**
 * Generate JWT token
 */
export const generateToken = (userId, email) => {
  return jwt.sign(
    { id: userId, email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRE }
  );
};

/**
 * Verify JWT token
 */
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

/**
 * Generate reset token
 */
export const generateResetToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Generate verification token
 */
export const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Sign up user
 */
export const signupUser = async (email, password, firstName, lastName) => {
  try {
    // Check if user already exists
    const userExists = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (userExists.rows.length > 0) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Generate verification token
    const verificationToken = generateVerificationToken();
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, verification_token, verification_token_expires)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, first_name, last_name, is_verified, created_at`,
      [email.toLowerCase(), passwordHash, firstName, lastName, verificationToken, verificationTokenExpires]
    );

    const user = result.rows[0];

    // Generate JWT token
    const token = generateToken(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        isVerified: user.is_verified,
      },
      token,
      verificationToken,
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Login user
 */
export const loginUser = async (email, password) => {
  try {
    // Find user by email
    const result = await pool.query(
      'SELECT id, email, password_hash, first_name, last_name, is_verified FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid email or password');
    }

    const user = result.rows[0];

    // Compare password
    const isPasswordValid = await comparePassword(password, user.password_hash);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Update last login
    await pool.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    // Generate JWT token
    const token = generateToken(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        isVerified: user.is_verified,
      },
      token,
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Request password reset
 */
export const requestPasswordReset = async (email) => {
  try {
    // Find user by email
    const result = await pool.query(
      'SELECT id, email FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      // Don't reveal if email exists for security
      return { message: 'If email exists, reset link will be sent' };
    }

    const user = result.rows[0];

    // Generate reset token
    const resetToken = generateResetToken();
    const resetTokenExpires = new Date(Date.now() + RESET_TOKEN_EXPIRE);

    // Save reset token to database
    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [resetToken, resetTokenExpires, user.id]
    );

    return {
      message: 'If email exists, reset link will be sent',
      resetToken, // In production, send this via email
      userId: user.id,
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Reset password
 */
export const resetPassword = async (resetToken, newPassword) => {
  try {
    // Find user with valid reset token
    const result = await pool.query(
      `SELECT id, email FROM users 
       WHERE reset_token = $1 AND reset_token_expires > NOW()`,
      [resetToken]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid or expired reset token');
    }

    const user = result.rows[0];

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update password and clear reset token
    await pool.query(
      `UPDATE users 
       SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL, updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    return { message: 'Password reset successfully' };
  } catch (error) {
    throw error;
  }
};

/**
 * Verify email
 */
export const verifyEmail = async (verificationToken) => {
  try {
    // Find user with valid verification token
    const result = await pool.query(
      `SELECT id, email FROM users 
       WHERE verification_token = $1 AND verification_token_expires > NOW()`,
      [verificationToken]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid or expired verification token');
    }

    const user = result.rows[0];

    // Mark email as verified and clear verification token
    await pool.query(
      `UPDATE users 
       SET is_verified = TRUE, verification_token = NULL, verification_token_expires = NULL, updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    return { message: 'Email verified successfully' };
  } catch (error) {
    throw error;
  }
};

/**
 * Get user by ID
 */
export const getUserById = async (userId) => {
  try {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, is_verified, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];
    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      isVerified: user.is_verified,
      createdAt: user.created_at,
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Update user profile
 */
export const updateUserProfile = async (userId, firstName, lastName) => {
  try {
    const result = await pool.query(
      `UPDATE users 
       SET first_name = $1, last_name = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, email, first_name, last_name, is_verified`,
      [firstName, lastName, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = result.rows[0];
    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      isVerified: user.is_verified,
    };
  } catch (error) {
    throw error;
  }
};
