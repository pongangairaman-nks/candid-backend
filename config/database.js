import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Neon PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Test database connection
export const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Connected to Neon PostgreSQL database');
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    return false;
  }
};

// Initialize database tables
export const initDatabase = async () => {
  const client = await pool.connect();
  try {
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        is_verified BOOLEAN DEFAULT FALSE,
        verification_token VARCHAR(255),
        verification_token_expires TIMESTAMP,
        reset_token VARCHAR(255),
        reset_token_expires TIMESTAMP,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create index on email for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS resumes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        original_latex TEXT,
        master_resume_text TEXT,
        job_description TEXT,
        analysis_json JSONB,
        tailored_latex TEXT,
        pdf_url TEXT,
        ats_score INTEGER,
        ats_analysis JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS files (
        id SERIAL PRIMARY KEY,
        resume_id INTEGER REFERENCES resumes(id) ON DELETE CASCADE,
        file_type VARCHAR(50),
        file_name VARCHAR(255),
        file_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS llm_configs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        analyzer_provider VARCHAR(50) NOT NULL DEFAULT 'gemini',
        analyzer_model VARCHAR(100) NOT NULL DEFAULT 'gemini-2.5-flash',
        analyzer_api_key TEXT,
        generator_provider VARCHAR(50) NOT NULL DEFAULT 'claude',
        generator_model VARCHAR(100) NOT NULL DEFAULT 'claude-opus-4-1-20250805',
        generator_api_key TEXT,
        master_content TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_llm_configs_user_id ON llm_configs(user_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS cover_letters (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        original_latex TEXT,
        master_cover_letter_text TEXT,
        job_description TEXT,
        analysis_json JSONB,
        tailored_latex TEXT,
        pdf_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS job_applications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        position VARCHAR(255) NOT NULL,
        company_name VARCHAR(255) NOT NULL,
        industry VARCHAR(100),
        company_url TEXT,
        job_url TEXT,
        job_portal VARCHAR(100),
        job_description TEXT,
        status VARCHAR(50) DEFAULT 'applied',
        applied_date DATE,
        interview_date DATE,
        notes TEXT,
        resume_id INTEGER REFERENCES resumes(id) ON DELETE SET NULL,
        cover_letter_id INTEGER REFERENCES cover_letters(id) ON DELETE SET NULL,
        resume_pdf_url TEXT,
        cover_letter_pdf_url TEXT,
        generated_resume_latex TEXT,
        generated_cover_letter_latex TEXT,
        resume_prompt TEXT,
        cover_letter_prompt TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_job_applications_user_id ON job_applications(user_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_job_applications_status ON job_applications(status);
    `);

    // Add missing columns if they don't exist (migration for existing databases)
    await client.query(`
      ALTER TABLE job_applications
      ADD COLUMN IF NOT EXISTS job_description TEXT,
      ADD COLUMN IF NOT EXISTS generated_resume_latex TEXT,
      ADD COLUMN IF NOT EXISTS generated_cover_letter_latex TEXT,
      ADD COLUMN IF NOT EXISTS resume_prompt TEXT,
      ADD COLUMN IF NOT EXISTS cover_letter_prompt TEXT,
      ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);
    
    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
    throw error;
  } finally {
    client.release();
  }
};

export default pool;
