import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Neon PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Test DB connection
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

// Initialize DB
export const initDatabase = async () => {
  const client = await pool.connect();
  try {
    // USERS
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

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

    // RESUMES
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
        resume_chunks JSONB,
        jd_summary TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // FILES
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

    // LLM CONFIGS
    await client.query(`
      CREATE TABLE IF NOT EXISTS llm_configs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        analyzer_provider VARCHAR(50) DEFAULT 'claude',
        analyzer_model VARCHAR(100) DEFAULT 'claude-3-5-haiku-20241022',
        analyzer_api_key TEXT,
        generator_provider VARCHAR(50) DEFAULT 'openai',
        generator_model VARCHAR(100) DEFAULT 'gpt-4o-mini',
        generator_api_key TEXT,
        master_content TEXT,
        master_resume_prompt TEXT,
        master_cover_letter_prompt TEXT,
        master_resume TEXT,
        master_cover_letter TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_llm_configs_user_id 
      ON llm_configs(user_id);
    `);

    // FEATURE FLAGS
    await client.query(`
      CREATE TABLE IF NOT EXISTS feature_flags (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        flag_name VARCHAR(100) NOT NULL,
        flag_value BOOLEAN DEFAULT true,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, flag_name)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_feature_flags_user_id_flag_name
      ON feature_flags(user_id, flag_name);
    `);

    // LLM USAGE LOGS
    await client.query(`
      CREATE TABLE IF NOT EXISTS llm_usage_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        endpoint VARCHAR(100) NOT NULL,
        phase VARCHAR(50) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        model VARCHAR(100),
        input_tokens INTEGER,
        output_tokens INTEGER,
        total_tokens INTEGER,
        latency_ms INTEGER,
        status VARCHAR(20),
        error TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_user_id_created_at
      ON llm_usage_logs(user_id, created_at);
    `);

    // ANALYZE CACHE
    await client.query(`
      CREATE TABLE IF NOT EXISTS analyze_cache (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        content_hash VARCHAR(64) NOT NULL,
        analysis_json JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, content_hash)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_analyze_cache_user_id_hash
      ON analyze_cache(user_id, content_hash);
    `);

    // COVER LETTERS
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

    // JOB APPLICATIONS
    await client.query(`
      CREATE TABLE IF NOT EXISTS job_applications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        position VARCHAR(255),
        company_name VARCHAR(255),
        industry VARCHAR(100),
        company_url TEXT,
        job_url TEXT,
        job_portal VARCHAR(100),
        job_description TEXT,
        status VARCHAR(50) DEFAULT 'applied',
        applied_date DATE,
        interview_date DATE,
        notes TEXT,
        resume_id INTEGER REFERENCES resumes(id),
        cover_letter_id INTEGER REFERENCES cover_letters(id),
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
      CREATE INDEX IF NOT EXISTS idx_job_applications_user_id 
      ON job_applications(user_id);
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