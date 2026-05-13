/**
 * Database Schema Updates for Resume Architecture Refactor
 * 
 * Adds new columns to resumes table for:
 * - Master template storage (original LaTeX)
 * - Extracted JSON content
 * - Handlebars template
 * - Optimized content and final LaTeX
 * - ATS analysis results
 * 
 * Note: No migration script needed (dev phase, can delete existing data)
 * Run these SQL commands directly in your database
 */

-- Add new columns to resumes table
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS whole_master_template TEXT;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS extracted_content_json JSONB;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS created_latex_template TEXT;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS optimized_content_json JSONB;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS final_latex TEXT;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS template_version VARCHAR(10) DEFAULT '1.0';
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS ats_analysis JSONB;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_resumes_created_at ON resumes(created_at);
CREATE INDEX IF NOT EXISTS idx_resumes_updated_at ON resumes(updated_at);

-- Optional: Create a table for LLM usage logs (for Phase 2)
CREATE TABLE IF NOT EXISTS llm_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phase VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  input_tokens INT,
  output_tokens INT,
  cost_usd DECIMAL(10, 6),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for llm_usage_logs
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_user_created ON llm_usage_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_phase ON llm_usage_logs(phase);

-- Verify the schema changes
-- Run this to check if columns were added successfully:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'resumes' ORDER BY ordinal_position;
