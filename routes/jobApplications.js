import express from 'express';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get all job applications for a user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT id, position, company_name, industry, company_url, job_url, job_portal, 
              job_description, status, applied_date, interview_date, notes, resume_pdf_url, 
              cover_letter_pdf_url, generated_resume_latex, generated_cover_letter_latex,
              resume_prompt, cover_letter_prompt, last_modified_at, created_at, updated_at
       FROM job_applications 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching job applications:', error);
    res.status(500).json({ error: 'Failed to fetch job applications' });
  }
});

// Get single job application
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const result = await pool.query(
      `SELECT * FROM job_applications 
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job application not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching job application:', error);
    res.status(500).json({ error: 'Failed to fetch job application' });
  }
});

// Create new job application
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      position,
      company_name,
      industry = null,
      company_url = null,
      job_url = null,
      job_portal = null,
      status = 'applied',
      applied_date = null,
      interview_date = null,
      notes = null,
    } = req.body;

    if (!position || !company_name) {
      return res.status(400).json({ error: 'Position and company name are required' });
    }

    // Convert empty strings to null for date fields
    const appliedDateValue = applied_date && applied_date.trim() ? applied_date : null;
    const interviewDateValue = interview_date && interview_date.trim() ? interview_date : null;

    const result = await pool.query(
      `INSERT INTO job_applications 
       (user_id, position, company_name, industry, company_url, job_url, job_portal, 
        status, applied_date, interview_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [userId, position, company_name, industry, company_url, job_url, job_portal, 
       status, appliedDateValue, interviewDateValue, notes]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating job application:', error.message);
    console.error('Error details:', error);
    res.status(500).json({ error: 'Failed to create job application', details: error.message });
  }
});

// Update job application
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const {
      position,
      company_name,
      industry,
      company_url,
      job_url,
      job_portal,
      job_description,
      status,
      applied_date,
      interview_date,
      notes,
      resume_pdf_url,
      cover_letter_pdf_url,
      generated_resume_latex,
      generated_cover_letter_latex,
      resume_prompt,
      cover_letter_prompt,
    } = req.body;

    // Verify ownership
    const checkResult = await pool.query(
      'SELECT id FROM job_applications WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job application not found' });
    }

    const result = await pool.query(
      `UPDATE job_applications 
       SET position = COALESCE($1, position),
           company_name = COALESCE($2, company_name),
           industry = COALESCE($3, industry),
           company_url = COALESCE($4, company_url),
           job_url = COALESCE($5, job_url),
           job_portal = COALESCE($6, job_portal),
           job_description = COALESCE($7, job_description),
           status = COALESCE($8, status),
           applied_date = COALESCE($9, applied_date),
           interview_date = COALESCE($10, interview_date),
           notes = COALESCE($11, notes),
           resume_pdf_url = COALESCE($12, resume_pdf_url),
           cover_letter_pdf_url = COALESCE($13, cover_letter_pdf_url),
           generated_resume_latex = COALESCE($14, generated_resume_latex),
           generated_cover_letter_latex = COALESCE($15, generated_cover_letter_latex),
           resume_prompt = COALESCE($16, resume_prompt),
           cover_letter_prompt = COALESCE($17, cover_letter_prompt),
           last_modified_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $18 AND user_id = $19
       RETURNING *`,
      [position, company_name, industry, company_url, job_url, job_portal, job_description,
       status, applied_date, interview_date, notes, resume_pdf_url, cover_letter_pdf_url,
       generated_resume_latex, generated_cover_letter_latex, resume_prompt, cover_letter_prompt,
       id, userId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating job application:', error);
    res.status(500).json({ error: 'Failed to update job application' });
  }
});

// Delete job application
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      'DELETE FROM job_applications WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job application not found' });
    }

    res.json({ message: 'Job application deleted successfully' });
  } catch (error) {
    console.error('Error deleting job application:', error);
    res.status(500).json({ error: 'Failed to delete job application' });
  }
});

// Update job application status
router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const result = await pool.query(
      `UPDATE job_applications 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [status, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job application not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating job application status:', error);
    res.status(500).json({ error: 'Failed to update job application status' });
  }
});

export default router;
