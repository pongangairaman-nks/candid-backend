import express from 'express';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * Mapper: DB → API response
 */
const mapJobApplication = (row) => ({
  id: row.id,
  position: row.position,

  companyName: row.company_name,
  companyUrl: row.company_url,
  industry: row.industry,

  jobUrl: row.job_url,
  jobPortal: row.job_portal,
  jobDescription: row.job_description,

  status: row.status,

  appliedDate: row.applied_date,
  interviewDate: row.interview_date,

  notes: row.notes,

  resumePdfUrl: row.resume_pdf_url,
  coverLetterPdfUrl: row.cover_letter_pdf_url,

  generatedResumeLatex: row.generated_resume_latex,
  generatedCoverLetterLatex: row.generated_cover_letter_latex,

  resumePrompt: row.resume_prompt,
  coverLetterPrompt: row.cover_letter_prompt,

  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// ✅ GET all job applications
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.id;

    const result = await pool.query(
      `SELECT * FROM job_applications
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [user_id]
    );

    res.json(result.rows.map(mapJobApplication));
  } catch (error) {
    console.error('Error fetching job applications:', error);
    res.status(500).json({ error: 'Failed to fetch job applications' });
  }
});

// ✅ GET single job application
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    const result = await pool.query(
      `SELECT * FROM job_applications
       WHERE id = $1 AND user_id = $2`,
      [id, user_id]
    );

    if (!result.rows?.length) {
      return res.status(404).json({ error: 'Job application not found' });
    }

    res.json(mapJobApplication(result.rows?.[0]));
  } catch (error) {
    console.error('Error fetching job application:', error);
    res.status(500).json({ error: 'Failed to fetch job application' });
  }
});

// ✅ CREATE job application
router.post('/', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.id;

    const {
      position,
      companyName,
      industry,
      companyUrl,
      jobUrl,
      jobPortal,
      status = 'applied',
      appliedDate,
      interviewDate,
      notes,
    } = req.body;

    if (!position || !companyName) {
      return res.status(400).json({ error: 'Position and company name are required' });
    }

    const result = await pool.query(
      `INSERT INTO job_applications 
       (user_id, position, company_name, industry, company_url, job_url, job_portal,
        status, applied_date, interview_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        user_id,
        position,
        companyName,
        industry || null,
        companyUrl || null,
        jobUrl || null,
        jobPortal || null,
        status,
        appliedDate || null,
        interviewDate || null,
        notes || null,
      ]
    );

    res.status(201).json(mapJobApplication(result.rows?.[0]));
  } catch (error) {
    console.error('Error creating job application:', error);
    res.status(500).json({ error: 'Failed to create job application' });
  }
});

// ✅ UPDATE job application
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    const data = req.body;

    const check = await pool.query(
      `SELECT id FROM job_applications WHERE id = $1 AND user_id = $2`,
      [id, user_id]
    );

    if (!check.rows?.length) {
      return res.status(404).json({ error: 'Job application not found' });
    }

    const now = new Date().toISOString();
    const result = await pool.query(
      `UPDATE job_applications SET
        position = COALESCE($1, position),
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
        updated_at = $20
       WHERE id = $18 AND user_id = $19
       RETURNING *`,
      [
        data.position,
        data.companyName,
        data.industry,
        data.companyUrl,
        data.jobUrl,
        data.jobPortal,
        data.jobDescription,
        data.status,
        data.appliedDate,
        data.interviewDate,
        data.notes,
        data.resumePdfUrl,
        data.coverLetterPdfUrl,
        data.generatedResumeLatex,
        data.generatedCoverLetterLatex,
        data.resumePrompt,
        data.coverLetterPrompt,
        id,
        user_id,
        now,
      ]
    );

    res.json(mapJobApplication(result.rows?.[0]));
  } catch (error) {
    console.error('Error updating job application:', error);
    res.status(500).json({ error: 'Failed to update job application' });
  }
});

// ✅ DELETE job application
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    const result = await pool.query(
      `DELETE FROM job_applications WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, user_id]
    );

    if (!result.rows?.length) {
      return res.status(404).json({ error: 'Job application not found' });
    }

    res.json({ message: 'Job application deleted successfully' });
  } catch (error) {
    console.error('Error deleting job application:', error);
    res.status(500).json({ error: 'Failed to delete job application' });
  }
});

// ✅ UPDATE status
router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const now = new Date().toISOString();
    const result = await pool.query(
      `UPDATE job_applications 
       SET status = $1, updated_at = $4
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [status, id, user_id, now]
    );

    if (!result.rows?.length) {
      return res.status(404).json({ error: 'Job application not found' });
    }

    res.json(mapJobApplication(result.rows?.[0]));
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Failed to update job application status' });
  }
});

export default router;