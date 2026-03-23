# Resume Automation Platform - Complete Architecture & Working Flow

## 📋 Table of Contents
1. [System Overview](#system-overview)
2. [Frontend Architecture](#frontend-architecture)
3. [Backend Architecture](#backend-architecture)
4. [Complete User Journey](#complete-user-journey)
5. [Token Optimization Strategy](#token-optimization-strategy)
6. [Master Resume & Content Handling](#master-resume--content-handling)
7. [ATS Optimization Pipeline](#ats-optimization-pipeline)
8. [LLM Integration & Fallback Strategy](#llm-integration--fallback-strategy)
9. [Data Flow Diagrams](#data-flow-diagrams)

---

## System Overview

**Candid** is an AI-powered resume optimization platform that uses multiple LLM providers (Claude, OpenAI, Gemini) to:
- Analyze job descriptions and extract critical requirements
- Tailor resumes to match specific job postings
- Calculate ATS (Applicant Tracking System) scores
- Generate optimized cover letters
- Track job applications with detailed analytics

### Tech Stack
- **Frontend**: Next.js 14, React 18, TypeScript, Zustand (state management), TailwindCSS
- **Backend**: Express.js, Node.js, PostgreSQL (Neon), Firebase Storage
- **LLM Providers**: Claude (Anthropic), GPT-4/GPT-4o (OpenAI), Gemini (Google)
- **Database**: Neon PostgreSQL with connection pooling
- **Authentication**: JWT-based with token expiration handling

---

## Frontend Architecture

### Directory Structure
```
app/src/
├── app/                          # Next.js app directory
│   ├── layout.tsx               # Root layout with ToastContainer
│   ├── page.tsx                 # Login/Signup page
│   ├── dashboard/
│   │   ├── layout.tsx           # Protected dashboard layout
│   │   ├── configuration/       # LLM config & master templates
│   │   ├── jobs/                # Job applications listing
│   │   └── jobs/resume/[jobId]/ # Resume generation & optimization
│   └── forgot-password/         # Password reset flow
├── components/
│   ├── Auth/                    # LoginForm, SignupForm
│   ├── Navigation/              # Sidebar, Header
│   ├── LLMConfigSection.tsx     # LLM provider configuration
│   ├── ResumeListingScreen.tsx  # Job applications list
│   ├── ResumeDetailsModal.tsx   # Job application CRUD
│   ├── PreviewModal.tsx         # PDF preview
│   ├── ATSScoreModal.tsx        # ATS score display
│   └── SelectiveOptimizationModal.tsx # Section-level optimization
├── store/
│   ├── authStore.ts            # Authentication state (Zustand)
│   └── resumeStore.ts          # Resume & configuration state
├── services/
│   └── api.ts                  # Axios API client & endpoints
└── hooks/
    └── useToast.ts             # Toast notification hook
```

### State Management (Zustand)

#### `authStore.ts`
```typescript
- user: User | null
- isAuthenticated: boolean
- isLoading: boolean
- error: string | null
- login(credentials) → JWT token stored in localStorage
- signup(credentials) → JWT token stored in localStorage
- logout() → Clear localStorage
- initializeAuth() → Restore session from localStorage
```

#### `resumeStore.ts`
```typescript
- masterDocument: string           # Master resume LaTeX
- jobDescription: string           # Current job description
- latexCode: string               # Generated tailored resume
- pdfUrl: string | null           # Generated PDF URL
- isLoading: boolean
- error: string | null
- setters for all above
```

### Key Components

#### 1. **LLMConfigSection.tsx** - LLM Provider Configuration
**Purpose**: Allow users to configure which LLM providers to use for analysis and generation

**Flow**:
```
User selects analyzer provider (Claude/OpenAI/Gemini)
    ↓
User selects analyzer model (e.g., claude-3-5-sonnet)
    ↓
User enters analyzer API key
    ↓
User selects generator provider (Claude/OpenAI/Gemini)
    ↓
User selects generator model (e.g., gpt-4o-mini)
    ↓
User enters generator API key
    ↓
Save to backend → Stored in llm_configs table
```

**Optimization**: 
- Uses `useRef` flags to prevent duplicate API calls on mount
- Caches provider list for 5 minutes
- Lazy loads models only when provider changes
- No re-fetching on page revisits (uses global cache)

#### 2. **ResumeListingScreen.tsx** - Job Applications Dashboard
**Purpose**: Display all job applications and their status

**Features**:
- Fetch all job applications for logged-in user
- Pagination (10 items per page)
- Create/Edit/View/Delete job applications
- Track application status (applied, screening, interview, offer, rejected, etc.)
- Link to resume generation page

**Optimization**:
- Single fetch on component mount
- `useRef` flag prevents duplicate API calls
- No caching needed (data changes frequently)

#### 3. **Resume Generation Page** (`[jobId]/page.tsx`)
**Purpose**: Core resume tailoring and optimization interface

**Key Features**:
- **Master Resume Display**: Shows the base resume template
- **Job Description Input**: Paste job description
- **Real-time Autosave**: Debounced save (1 second delay)
- **ATS Score Calculation**: Shows match percentage
- **Selective Optimization**: Highlight text and optimize specific sections
- **PDF Generation**: Compile LaTeX to PDF
- **Prompt Customization**: Custom prompts for tailoring

**Data Flow**:
```
User pastes job description
    ↓
Autosave to database (job_applications.job_description)
    ↓
Click "Analyze Job" → POST /api/analyze
    ↓
Backend extracts keywords, missing skills, role focus
    ↓
Display analysis results
    ↓
Click "Generate Resume" → POST /api/generate-resume
    ↓
Backend tailors resume using LLM
    ↓
Display tailored LaTeX
    ↓
Click "Generate PDF" → POST /api/compile-latex
    ↓
Display PDF preview
```

**Optimization Features**:
- **Selective Section Optimization**: 
  - User highlights text in resume
  - System detects which section (experience, skills, etc.)
  - Sends only that section to LLM for optimization
  - Replaces section in full resume
  - Triggers incremental ATS re-score (cheaper than full re-analysis)

- **Incremental ATS Re-scoring**:
  - After editing a section, calls `/api/ats/llm/rescore`
  - Only re-evaluates affected requirements
  - Uses cheaper models (gpt-4o-mini instead of gpt-4o)
  - Calculates score delta instead of full re-analysis

#### 4. **Configuration Page** (`dashboard/configuration/page.tsx`)
**Purpose**: Manage master templates and LLM configuration

**Tabs**:
1. **LLM Configuration** - Provider/model selection (via LLMConfigSection)
2. **Master Resume Template** - LaTeX template for all resumes
3. **Master Content** - Comprehensive skills/experience repository
4. **Master Prompts** - Custom prompts for resume generation
5. **Master Cover Letter** - Cover letter LaTeX template

**Data Persistence**:
- Master templates stored in `resumes` table (master_resume_text, original_latex)
- Master content stored in `llm_configs` table (master_content)
- Master prompts stored in `llm_configs` table (master_resume_prompt, master_cover_letter_prompt)

**Caching Strategy**:
- Uses Zustand store to cache configuration on first load
- On page revisit, loads instantly from cache
- No duplicate API calls (uses `useRef` flags)

---

## Backend Architecture

### Directory Structure
```
server/
├── config/
│   ├── database.js              # PostgreSQL connection pool
│   └── firebase.js              # Firebase Admin initialization
├── middleware/
│   ├── auth.js                  # JWT authentication
│   └── upload.js                # File upload handling
├── routes/
│   ├── auth.js                  # Login, signup, password reset
│   ├── resume.js                # Master template CRUD
│   ├── analyze.js               # Job description analysis
│   ├── generate.js              # Resume tailoring
│   ├── atsAnalysis.js           # ATS scoring (legacy + LLM-based)
│   ├── llmConfig.js             # LLM provider configuration
│   ├── jobApplications.js       # Job application CRUD
│   ├── pdf.js                   # LaTeX compilation
│   ├── upload.js                # Resume file upload
│   └── health.js                # Health check endpoint
├── services/
│   ├── claudeService.js         # Claude API integration
│   ├── openaiService.js         # OpenAI API integration
│   ├── geminiService.js         # Gemini API integration
│   ├── atsService.js            # ATS scoring algorithm
│   ├── atsLLMService.js         # LLM-based ATS (token-efficient)
│   ├── authService.js           # JWT & password hashing
│   └── fileService.js           # Firebase file operations
├── prompts/
│   └── geminiAnalysisPrompt.js  # Gemini-specific prompts
└── server.js                    # Express app initialization
```

### Database Schema

#### `users` table
```sql
id (PK)
email (UNIQUE)
password_hash
first_name, last_name
is_verified
verification_token, verification_token_expires
reset_token, reset_token_expires
last_login
created_at, updated_at
```

#### `resumes` table
```sql
id (PK)
user_id (FK → users)
original_latex              # Master template LaTeX
master_resume_text          # Master resume text (for analysis)
job_description             # Current job description
analysis_json               # Gemini/Claude analysis results
tailored_latex              # Generated tailored resume
pdf_url                     # Generated PDF URL
ats_score                   # Overall ATS score
ats_analysis                # Detailed ATS analysis (JSON)
resume_chunks               # Chunked resume for RAG
jd_summary                  # Summarized job description
created_at, updated_at
```

#### `llm_configs` table
```sql
id (PK)
user_id (FK → users, UNIQUE)
analyzer_provider           # 'claude', 'openai', 'gemini'
analyzer_model              # Model name
analyzer_api_key            # Encrypted API key
generator_provider          # 'claude', 'openai', 'gemini'
generator_model             # Model name
generator_api_key           # Encrypted API key
master_content              # Comprehensive skills repository
master_resume_prompt        # Custom resume generation prompt
master_cover_letter_prompt  # Custom cover letter prompt
use_latex_template          # Boolean flag
is_active                   # Boolean flag
created_at, updated_at
```

#### `job_applications` table
```sql
id (PK)
user_id (FK → users)
position, company_name
industry, company_url, job_url, job_portal
job_description             # Pasted job description
status                      # 'applied', 'screening', 'interview', etc.
applied_date, interview_date
notes
resume_id (FK → resumes)
cover_letter_id (FK → cover_letters)
resume_pdf_url, cover_letter_pdf_url
generated_resume_latex, generated_cover_letter_latex
resume_prompt, cover_letter_prompt
created_at, updated_at, last_modified_at
```

#### `cover_letters` table
```sql
id (PK)
user_id (FK → users)
original_latex
master_cover_letter_text
job_description
analysis_json
tailored_latex
pdf_url
created_at, updated_at
```

### API Endpoints

#### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token
- `POST /api/auth/verify-email` - Verify email address
- `GET /api/auth/me` - Get current user

#### Resume Management
- `GET /api/resume/master-template` - Fetch master LaTeX template
- `POST /api/resume/save-master-template` - Save master template
- `GET /api/resume/master-cover-letter-template` - Fetch master cover letter
- `POST /api/resume/save-master-cover-letter-template` - Save master cover letter

#### Job Analysis & Generation
- `POST /api/analyze` - Analyze job description (extracts keywords, missing skills)
- `POST /api/generate-resume` - Generate tailored resume
- `POST /api/compile-latex` - Compile LaTeX to PDF

#### ATS Analysis
- `POST /api/ats/analysis` - Legacy ATS scoring (comprehensive)
- `POST /api/ats/llm/analysis` - LLM-based ATS baseline (token-efficient)
- `POST /api/ats/llm/rescore` - Incremental re-score after section edit
- `GET /api/ats/llm/usage` - Get LLM usage statistics

#### LLM Configuration
- `GET /api/llm/providers` - List available LLM providers
- `GET /api/llm/models-for-user/:provider` - Get models for provider
- `GET /api/llm/config` - Get user's LLM configuration
- `PUT /api/llm/config` - Update LLM configuration

#### Job Applications
- `GET /api/job-applications` - List all job applications
- `GET /api/job-applications/:id` - Get single application
- `POST /api/job-applications` - Create new application
- `PUT /api/job-applications/:id` - Update application
- `PATCH /api/job-applications/:id/status` - Update status
- `DELETE /api/job-applications/:id` - Delete application

---

## Complete User Journey

### 1. **Onboarding**
```
User visits app
    ↓
Redirected to login page (if not authenticated)
    ↓
User signs up with email/password
    ↓
JWT token stored in localStorage
    ↓
Redirected to /dashboard/jobs
    ↓
Empty state: "No job applications yet"
```

### 2. **Configuration Setup**
```
User navigates to Configuration page
    ↓
Sees 5 tabs: LLM, Template, Content, Prompts, Cover Letter
    ↓
Tab 1: LLM Configuration
    - Selects analyzer provider (Claude recommended)
    - Selects analyzer model (claude-3-5-sonnet)
    - Enters Claude API key
    - Selects generator provider (OpenAI recommended)
    - Selects generator model (gpt-4o-mini)
    - Enters OpenAI API key
    - Clicks Save
    ↓
Tab 2: Master Resume Template
    - Pastes LaTeX resume template
    - Clicks Save
    ↓
Tab 3: Master Content
    - Pastes comprehensive skills/experience repository
    - Used as reference during tailoring
    - Clicks Save
    ↓
Tab 4: Master Prompts
    - Sets custom prompt for resume generation
    - Sets custom prompt for cover letter generation
    ↓
Tab 5: Master Cover Letter
    - Pastes LaTeX cover letter template
    - Clicks Save
```

### 3. **Job Application Creation**
```
User navigates to Jobs page
    ↓
Clicks "Create New Application"
    ↓
Modal opens with form:
    - Position (required)
    - Company Name (required)
    - Industry
    - Company URL
    - Job URL
    - Job Portal (LinkedIn, Indeed, etc.)
    - Applied Date
    - Interview Date
    - Status (applied, screening, interview, etc.)
    - Notes
    ↓
User fills form and clicks Create
    ↓
Application saved to database
    ↓
Redirected to resume generation page for this job
```

### 4. **Resume Tailoring & Optimization**
```
User on resume generation page (/dashboard/jobs/resume/[jobId])
    ↓
Sees master resume on left, job description input on right
    ↓
User pastes job description
    ↓
Autosave triggers (1 second debounce)
    ↓
User clicks "Analyze Job"
    ↓
Backend calls /api/analyze:
    - Fetches master resume from database
    - Calls Claude/OpenAI/Gemini to extract:
      * Primary keywords (5-10)
      * Secondary keywords (5-10)
      * Missing skills (5-10)
      * Matching skills (5-10)
      * Role focus (1-2 sentences)
      * Seniority level
      * Experience gaps
      * ATS optimization tips
    - Stores analysis in database
    ↓
Frontend displays analysis results
    ↓
User clicks "Generate Resume"
    ↓
Backend calls /api/generate-resume:
    - Fetches master resume, job description, analysis
    - Calls Claude/OpenAI/Gemini with:
      * Original LaTeX template
      * Job analysis (keywords, missing skills, role focus)
      * Master resume text (for context)
      * Master content (additional reference)
      * Custom prompt (if provided)
    - LLM updates content while preserving LaTeX structure
    - Stores tailored LaTeX in database
    ↓
Frontend displays tailored resume
    ↓
User clicks "Generate PDF"
    ↓
Backend calls /api/compile-latex:
    - Sends LaTeX to external compiler
    - Returns PDF blob
    ↓
Frontend displays PDF preview
    ↓
User can download PDF
```

### 5. **Selective Section Optimization**
```
User highlights text in resume editor
    ↓
Floating panel appears with "Optimize" button
    ↓
User clicks "Optimize"
    ↓
Modal opens for custom prompt
    ↓
User enters custom optimization prompt (optional)
    ↓
User clicks "Optimize Section"
    ↓
Backend calls /api/resume/optimize:
    - Detects which section was edited (experience, skills, etc.)
    - Calls Claude/OpenAI/Gemini with:
      * Selected text
      * Job description
      * Custom prompt
      * Full resume context
    - Returns optimized text
    ↓
Frontend replaces section in resume
    ↓
Triggers incremental ATS re-score:
    - Calls /api/ats/llm/rescore
    - Only re-evaluates affected requirements
    - Uses cheaper model (gpt-4o-mini)
    - Returns score delta
    ↓
Frontend updates ATS score
```

### 6. **ATS Score Calculation**
```
Two approaches:

APPROACH 1: Legacy ATS Scoring (Comprehensive)
    ↓
User clicks "Check ATS Score"
    ↓
Backend calls /api/ats/analysis:
    - Fetches resume, job description, analysis
    - Calculates ATS score using algorithm:
      * Primary keyword matching (40% weight)
      * Secondary keyword matching (20% weight)
      * Skill matching (20% weight)
      * Format quality (10% weight)
      * Seniority alignment (10% weight)
    - Returns score (0-100) with breakdown
    ↓
Frontend displays ATS modal with:
    - Overall score
    - Breakdown by category
    - Suggestions for improvement
    - Tips for ATS optimization

APPROACH 2: LLM-based ATS (Token-Efficient)
    ↓
User clicks "Check ATS Score"
    ↓
Backend calls /api/ats/llm/analysis:
    - Extracts requirements from job description (cheap model)
    - Maps requirements to resume (better model)
    - Calculates overall score
    - Tracks token usage
    ↓
Frontend displays same ATS modal
    ↓
User can view LLM usage stats in Configuration page
```

---

## Token Optimization Strategy

### Problem
LLMs charge by tokens. Resume optimization involves multiple API calls with large context windows (full resume + job description + analysis). This can get expensive quickly.

### Solution: Multi-Tier Approach

#### **Tier 1: Cheap Models for Initial Analysis**
```
Job Description Analysis:
  - Provider: Claude/OpenAI/Gemini (user's choice)
  - Model: claude-3-haiku (cheap), gpt-4o-mini (cheap), gemini-2.5-flash (free)
  - Tokens: ~1000-1500 tokens
  - Cost: ~$0.01-0.05 per analysis
  - Purpose: Extract keywords, missing skills, role focus
```

#### **Tier 2: Better Models for Generation**
```
Resume Tailoring:
  - Provider: Claude/OpenAI/Gemini (user's choice)
  - Model: claude-3-5-sonnet (balanced), gpt-4o (better), gemini-2.5-pro (better)
  - Tokens: ~3000-5000 tokens
  - Cost: ~$0.05-0.20 per generation
  - Purpose: Tailor resume content while preserving LaTeX structure
  - Optimization: Includes master_content as reference (reduces hallucination)
```

#### **Tier 3: Cheap Models for Incremental Updates**
```
Section Optimization:
  - Provider: Claude/OpenAI/Gemini (user's choice)
  - Model: claude-3-haiku (cheap), gpt-4o-mini (cheap), gemini-2.5-flash (free)
  - Tokens: ~500-1000 tokens
  - Cost: ~$0.005-0.02 per section
  - Purpose: Optimize single section without full resume context
  - Optimization: Only sends selected text + job description
```

#### **Tier 4: Incremental Re-scoring**
```
ATS Re-score After Edit:
  - Provider: Claude/OpenAI/Gemini (user's choice)
  - Model: claude-3-haiku (cheap), gpt-4o-mini (cheap), gemini-2.5-flash (free)
  - Tokens: ~800-1200 tokens
  - Cost: ~$0.005-0.02 per rescore
  - Purpose: Re-evaluate only affected requirements
  - Optimization: Sends only changed section + affected requirements
```

### Token Counting Strategy

#### In `atsLLMService.js`:
```javascript
// Cheap models for extraction (1000-1500 tokens)
const cheapDefaults = {
  claude: 'claude-3-haiku-20240307',      // ~$0.80 per 1M input tokens
  openai: 'gpt-4o-mini',                 // ~$0.15 per 1M input tokens
  gemini: 'gemini-2.5-flash',            // FREE
};

// Better models for mapping (3000-5000 tokens)
const mapDefaults = {
  claude: 'claude-3-5-sonnet-latest',    // ~$3 per 1M input tokens
  openai: 'gpt-4o',                      // ~$5 per 1M input tokens
  gemini: 'gemini-2.5-pro',              // ~$3.50 per 1M input tokens
};
```

### Caching to Reduce Calls

#### Frontend Caching (Zustand):
```typescript
// Configuration page caches on first load
- masterDocument (LaTeX template)
- masterContent (skills repository)
- masterResumePrompt
- masterCoverLetterPrompt
- configCached flag

// On page revisit: Load from cache instantly, no API call
```

#### Backend Caching:
```javascript
// Analysis results cached in database
- resume.analysis_json (job analysis results)
- resume.ats_analysis (ATS score breakdown)

// On revisit: Check if analysis exists before calling LLM
if (resume.analysis_json) {
  return cached analysis;
}
```

### Usage Tracking

```javascript
// Every LLM call tracked in ats_analysis.llm_usage array:
{
  ts: "2024-03-24T12:30:00Z",
  phase: 'analysis.extract' | 'analysis.map' | 'rescore',
  provider: 'claude' | 'openai' | 'gemini',
  model: 'claude-3-haiku-20240307',
  latency_ms: 1234,
  stub: false  // true if using LLM_STUB for testing
}

// Aggregated in /api/ats/llm/usage endpoint:
{
  total_calls: 5,
  analysis_calls: 2,
  rescore_calls: 3,
  total_latency_ms: 6234,
  stub_calls: 0
}
```

---

## Master Resume & Content Handling

### Master Resume (LaTeX Template)
**Purpose**: Base template for all generated resumes

**Storage**: `resumes.original_latex` (first resume record per user)

**Usage**:
1. User saves master template in Configuration → Master Resume Template tab
2. Stored in database
3. Used as base for all tailored resumes
4. LaTeX structure preserved during tailoring
5. Only content (text) is modified by LLM

**Example Structure**:
```latex
\documentclass{article}
\usepackage[utf8]{inputenc}
\usepackage{geometry}
\geometry{margin=0.5in}

\begin{document}

\section*{JOHN DOE}
\textit{Senior Software Engineer | San Francisco, CA}

\section*{PROFESSIONAL SUMMARY}
Results-driven engineer with 5+ years of experience...

\section*{CORE SKILLS}
React, TypeScript, Node.js, AWS, Docker...

\section*{PROFESSIONAL EXPERIENCE}

\textbf{Senior Engineer -- Tech Company} \hfill \textit{Jun 2022 -- Present}
\begin{itemize}
  \item Architected microservices reducing latency by 40%
  \item Led team of 5 engineers
\end{itemize}

\end{document}
```

### Master Content (Skills Repository)
**Purpose**: Comprehensive reference material for LLM during tailoring

**Storage**: `llm_configs.master_content`

**Usage**:
1. User saves master content in Configuration → Master Content tab
2. Includes comprehensive list of:
   - All skills (technical, soft, domain-specific)
   - All projects and achievements
   - All certifications and education
   - All relevant experience
3. Passed to LLM during resume tailoring as reference
4. Helps LLM select most relevant content for specific job
5. Reduces hallucination (LLM won't invent skills)

**Example Structure**:
```
COMPREHENSIVE SKILLS REPOSITORY

TECHNICAL SKILLS:
- Frontend: React, Vue, Angular, Next.js, Svelte
- Backend: Node.js, Python, Java, Go, Rust
- Databases: PostgreSQL, MongoDB, Redis, DynamoDB
- Cloud: AWS (EC2, Lambda, S3, RDS), GCP, Azure
- DevOps: Docker, Kubernetes, Terraform, CI/CD
- Tools: Git, GitHub, GitLab, Jira, Figma

SOFT SKILLS:
- Team Leadership (managed teams of 5-15)
- Mentoring (mentored 10+ junior engineers)
- Communication (presented at 5+ conferences)
- Project Management (Agile, Scrum)

PROJECTS:
1. E-commerce Platform
   - Built React + Node.js platform
   - Handled 1M+ daily transactions
   - Improved checkout conversion by 25%

2. Real-time Analytics Dashboard
   - Built with D3.js and WebSockets
   - Processed 100K+ events per second
   - Reduced latency from 5s to 200ms

CERTIFICATIONS:
- AWS Solutions Architect Associate
- Kubernetes Application Developer (CKAD)
- Google Cloud Professional Data Engineer

EDUCATION:
- BS Computer Science, Stanford University
- Relevant coursework: Algorithms, Distributed Systems, ML
```

### Master Prompts
**Purpose**: Custom instructions for resume tailoring

**Storage**: `llm_configs.master_resume_prompt`, `llm_configs.master_cover_letter_prompt`

**Default Prompt** (if user doesn't provide custom):
```
You are an expert resume content editor specializing in LaTeX documents.

CRITICAL RULES:
1. Preserve the ENTIRE LaTeX structure, commands, packages, and formatting
2. Do NOT add, remove, or modify any LaTeX commands
3. Do NOT change spacing, margins, or layout commands
4. Do NOT add or remove sections
5. ONLY update the actual text content (job titles, descriptions, skills, achievements)
6. Return ONLY the complete LaTeX document with updated content
7. Do NOT include explanations, markdown formatting, or code blocks

INSTRUCTIONS:
1. Update job descriptions and achievements to emphasize: [PRIMARY_KEYWORDS]
2. Reword bullet points to align with role focus: "[ROLE_FOCUS]"
3. If candidate has experience with: [MISSING_SKILLS], highlight them
4. Make content more relevant to this specific job
5. Keep all changes subtle and professional
```

**Custom Prompt Example**:
```
Focus on quantifiable metrics and impact. 
Emphasize leadership and team collaboration.
Use action verbs like "architected", "engineered", "optimized".
Highlight cost savings and revenue impact where applicable.
```

---

## ATS Optimization Pipeline

### Step 1: Job Description Analysis

**Endpoint**: `POST /api/analyze`

**Process**:
```javascript
1. User provides job description
2. Backend fetches master resume from database
3. Calls LLM (Claude/OpenAI/Gemini) with:
   - System prompt: "You are an ATS analyst"
   - User prompt: Job description + Master resume
4. LLM extracts and returns JSON:
   {
     "primary_keywords": ["React", "TypeScript", "AWS"],
     "secondary_keywords": ["Docker", "Kubernetes"],
     "missing_skills": ["Rust", "Terraform"],
     "matching_skills": ["Node.js", "PostgreSQL"],
     "role_focus": "Build scalable backend systems",
     "seniority_level": "senior",
     "experience_gaps": ["No Rust experience"],
     "ats_optimization_tips": ["Add AWS certifications"]
   }
5. Stores analysis in resume.analysis_json
```

**Token Cost**: ~1000-1500 tokens (~$0.01-0.05)

### Step 2: Resume Tailoring

**Endpoint**: `POST /api/generate-resume`

**Process**:
```javascript
1. Backend fetches:
   - Master resume (original_latex)
   - Job analysis (analysis_json)
   - Master content (from llm_configs)
   - Custom prompt (if provided)

2. Calls LLM with full context:
   - Original LaTeX template
   - Job analysis (keywords, missing skills, role focus)
   - Master resume text (for context)
   - Master content (skills repository)
   - Custom prompt

3. LLM updates content while preserving LaTeX:
   - Rewrites job descriptions to match keywords
   - Adds relevant skills from master content
   - Emphasizes matching experience
   - Keeps LaTeX structure intact

4. Stores tailored LaTeX in resume.tailored_latex

5. Returns tailored resume to frontend
```

**Token Cost**: ~3000-5000 tokens (~$0.05-0.20)

**Fallback Strategy**:
```javascript
try {
  // Try primary generator (e.g., Claude)
  tailoredLatex = await tailorWithClaude(...);
} catch (claudeError) {
  // Fallback to secondary (e.g., Gemini)
  tailoredLatex = await tailorWithGemini(...);
}
```

### Step 3: ATS Score Calculation

**Two Approaches**:

#### Approach A: Legacy ATS (Comprehensive)
**Endpoint**: `POST /api/ats/analysis`

**Algorithm**:
```javascript
1. Extract keywords from job description
2. Count keyword matches in resume
3. Calculate score:
   - Primary keywords: 40% weight
   - Secondary keywords: 20% weight
   - Skill matching: 20% weight
   - Format quality: 10% weight
   - Seniority alignment: 10% weight

4. Return score (0-100) with breakdown
```

**Token Cost**: ~500-1000 tokens (no LLM call, pure algorithm)

#### Approach B: LLM-based ATS (Token-Efficient)
**Endpoint**: `POST /api/ats/llm/analysis`

**Process**:
```javascript
1. Extract Requirements (Cheap Model):
   - Calls gpt-4o-mini or claude-3-haiku
   - Extracts 5-10 requirements from job description
   - Returns: [{ id, text, category, priority }]
   - Token cost: ~1000 tokens

2. Map Requirements to Resume (Better Model):
   - Calls gpt-4o or claude-3-5-sonnet
   - Maps each requirement to resume sections
   - Returns: [{ requirement_id, match_strength, evidence, section_key }]
   - Calculates overall score
   - Token cost: ~3000 tokens

3. Store in ats_analysis.llm:
   {
     "requirements": [...],
     "mappings": [...],
     "overall_score": 75,
     "keyword_gaps": [...],
     "strengths": [...],
     "critical_gaps": [...]
   }

4. Track usage in llm_usage array
```

**Token Cost**: ~4000 tokens (~$0.05-0.15)

### Step 4: Incremental Re-scoring (After Section Edit)

**Endpoint**: `POST /api/ats/llm/rescore`

**Process**:
```javascript
1. User edits a section (e.g., experience)
2. System detects section key (e.g., "experience.exp_1")
3. Calls cheap model (gpt-4o-mini) with:
   - Affected requirements (from baseline)
   - Old section text
   - New section text
4. LLM re-evaluates only affected requirements
5. Calculates score delta
6. Updates baseline with new scores
7. Returns: { updated_mappings, score_delta, new_overall_score }
```

**Token Cost**: ~800-1200 tokens (~$0.005-0.02)

**Optimization**: Only ~20% of full analysis cost

---

## LLM Integration & Fallback Strategy

### Provider Configuration

**User selects**:
1. **Analyzer Provider** (for job analysis):
   - Claude (recommended for quality)
   - OpenAI (recommended for speed)
   - Gemini (free option)

2. **Generator Provider** (for resume tailoring):
   - Claude (recommended for LaTeX preservation)
   - OpenAI (recommended for quality)
   - Gemini (free option)

### API Key Management

**Storage**:
- Encrypted in `llm_configs` table
- Never exposed to frontend
- Only used server-side

**Validation**:
- User enters API key in Configuration page
- Backend validates by making test call
- Stores if valid, returns error if invalid

### Fallback Strategy

#### For Resume Tailoring:
```javascript
try {
  // Try primary generator
  if (provider === 'openai') {
    tailoredLatex = await tailorWithOpenAI(...);
  } else if (provider === 'claude') {
    tailoredLatex = await tailorWithClaude(...);
  } else {
    tailoredLatex = await tailorWithGemini(...);
  }
} catch (primaryError) {
  console.warn('Primary provider failed, trying fallback...');
  
  // Fallback to secondary provider
  try {
    tailoredLatex = await tailorWithGemini(...);
  } catch (fallbackError) {
    throw new Error(`Both providers failed: ${primaryError.message}, ${fallbackError.message}`);
  }
}
```

#### For Job Analysis:
```javascript
const provider = userConfig.provider || 'gemini';

if (provider === 'claude') {
  analysis = await analyzeWithClaude(...);
} else if (provider === 'openai') {
  analysis = await analyzeWithOpenAI(...);
} else {
  analysis = await analyzeWithGemini(...);
}
```

### Model Selection

#### For Analysis (Cheap):
```javascript
const cheapDefaults = {
  claude: 'claude-3-haiku-20240307',      // $0.80 per 1M input tokens
  openai: 'gpt-4o-mini',                 // $0.15 per 1M input tokens
  gemini: 'gemini-2.5-flash',            // FREE
};
```

#### For Generation (Better):
```javascript
const generationDefaults = {
  claude: 'claude-3-5-sonnet-latest',    // $3 per 1M input tokens
  openai: 'gpt-4o',                      // $5 per 1M input tokens
  gemini: 'gemini-2.5-pro',              // $3.50 per 1M input tokens
};
```

### Error Handling

**Frontend**:
```typescript
try {
  const response = await resumeApi.optimizeResume(data);
  setLatexCode(response.data.optimizedLatex);
} catch (error) {
  setError('Failed to optimize resume. Please try again.');
  console.error('Optimization error:', error);
}
```

**Backend**:
```javascript
try {
  const tailoredLatex = await tailorResumeContent(...);
} catch (error) {
  console.error('❌ Resume generation error:', error.message);
  res.status(500).json({
    status: 'error',
    message: 'Failed to generate tailored resume',
    error: error.message
  });
}
```

---

## Data Flow Diagrams

### Complete Resume Optimization Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER JOURNEY                                  │
└─────────────────────────────────────────────────────────────────┘

1. CONFIGURATION SETUP
   ┌──────────────────────────────────────────────────────────────┐
   │ User → Configuration Page                                     │
   │   ├─ Set Analyzer (Claude/OpenAI/Gemini)                     │
   │   ├─ Set Generator (Claude/OpenAI/Gemini)                    │
   │   ├─ Upload Master Resume (LaTeX)                            │
   │   ├─ Upload Master Content (Skills Repository)               │
   │   └─ Set Custom Prompts                                      │
   │                                                               │
   │ Backend: Store in llm_configs & resumes tables               │
   │ Frontend: Cache in Zustand store                             │
   └──────────────────────────────────────────────────────────────┘

2. JOB APPLICATION CREATION
   ┌──────────────────────────────────────────────────────────────┐
   │ User → Jobs Page → Create Application                        │
   │   ├─ Position, Company, Industry, URLs                       │
   │   └─ Status, Dates, Notes                                    │
   │                                                               │
   │ Backend: Create job_applications record                      │
   │ Frontend: Redirect to resume generation page                 │
   └──────────────────────────────────────────────────────────────┘

3. JOB DESCRIPTION ANALYSIS
   ┌──────────────────────────────────────────────────────────────┐
   │ User → Resume Page → Paste Job Description                   │
   │   ↓ (Autosave after 1 second)                                │
   │ Backend: POST /api/analyze                                   │
   │   ├─ Fetch master resume                                     │
   │   ├─ Call LLM (Claude/OpenAI/Gemini)                        │
   │   ├─ Extract: keywords, missing skills, role focus           │
   │   └─ Store in resume.analysis_json                           │
   │                                                               │
   │ Frontend: Display analysis results                           │
   │   ├─ Primary keywords                                        │
   │   ├─ Missing skills                                          │
   │   └─ Role focus                                              │
   └──────────────────────────────────────────────────────────────┘

4. RESUME TAILORING
   ┌──────────────────────────────────────────────────────────────┐
   │ User → Click "Generate Resume"                               │
   │   ↓                                                           │
   │ Backend: POST /api/generate-resume                           │
   │   ├─ Fetch master resume (LaTeX)                             │
   │   ├─ Fetch job analysis                                      │
   │   ├─ Fetch master content (skills repository)                │
   │   ├─ Call LLM with full context                              │
   │   ├─ LLM updates content, preserves LaTeX structure          │
   │   └─ Store in resume.tailored_latex                          │
   │                                                               │
   │ Frontend: Display tailored resume                            │
   │   ├─ Show LaTeX code                                         │
   │   ├─ Show preview                                            │
   │   └─ Allow editing                                           │
   └──────────────────────────────────────────────────────────────┘

5. PDF GENERATION
   ┌──────────────────────────────────────────────────────────────┐
   │ User → Click "Generate PDF"                                  │
   │   ↓                                                           │
   │ Backend: POST /api/compile-latex                             │
   │   ├─ Send LaTeX to external compiler                         │
   │   └─ Return PDF blob                                         │
   │                                                               │
   │ Frontend: Display PDF preview                                │
   │   ├─ Show PDF in modal                                       │
   │   └─ Allow download                                          │
   └──────────────────────────────────────────────────────────────┘

6. ATS SCORE CALCULATION
   ┌──────────────────────────────────────────────────────────────┐
   │ User → Click "Check ATS Score"                               │
   │   ↓                                                           │
   │ Backend: POST /api/ats/llm/analysis                          │
   │   ├─ Extract requirements (cheap model)                      │
   │   ├─ Map to resume (better model)                            │
   │   ├─ Calculate overall score                                 │
   │   └─ Store in resume.ats_analysis                            │
   │                                                               │
   │ Frontend: Display ATS Modal                                  │
   │   ├─ Overall score (0-100)                                   │
   │   ├─ Breakdown by category                                   │
   │   ├─ Keyword gaps                                            │
   │   ├─ Strengths                                               │
   │   └─ Suggestions                                             │
   └──────────────────────────────────────────────────────────────┘

7. SELECTIVE SECTION OPTIMIZATION
   ┌──────────────────────────────────────────────────────────────┐
   │ User → Highlight text in resume                              │
   │   ↓                                                           │
   │ Frontend: Show "Optimize" button                              │
   │   ↓                                                           │
   │ User → Click "Optimize"                                      │
   │   ↓                                                           │
   │ Modal: Enter custom prompt (optional)                        │
   │   ↓                                                           │
   │ Backend: POST /api/resume/optimize                           │
   │   ├─ Detect section key                                      │
   │   ├─ Call cheap LLM model                                    │
   │   ├─ Optimize only selected text                             │
   │   └─ Return optimized text                                   │
   │                                                               │
   │ Frontend: Replace section in resume                          │
   │   ↓                                                           │
   │ Backend: POST /api/ats/llm/rescore                           │
   │   ├─ Re-evaluate affected requirements                       │
   │   ├─ Calculate score delta                                   │
   │   └─ Return new score                                        │
   │                                                               │
   │ Frontend: Update ATS score display                           │
   └──────────────────────────────────────────────────────────────┘
```

### Token Flow & Cost Optimization

```
┌─────────────────────────────────────────────────────────────────┐
│                    TOKEN USAGE BREAKDOWN                         │
└─────────────────────────────────────────────────────────────────┘

FIRST-TIME SETUP (Per Job Application):
  ├─ Job Analysis: ~1000-1500 tokens (~$0.01-0.05)
  ├─ Resume Tailoring: ~3000-5000 tokens (~$0.05-0.20)
  ├─ ATS Analysis: ~4000 tokens (~$0.05-0.15)
  └─ Total: ~8000-10500 tokens (~$0.11-0.40)

OPTIMIZATION ITERATIONS:
  ├─ Section Optimization: ~500-1000 tokens (~$0.005-0.02)
  ├─ ATS Re-score: ~800-1200 tokens (~$0.005-0.02)
  └─ Per iteration: ~1300-2200 tokens (~$0.01-0.04)

CACHING BENEFITS:
  ├─ Configuration cached: Save 1500 tokens per page revisit
  ├─ Job analysis cached: Save 1000 tokens per revisit
  ├─ ATS analysis cached: Save 4000 tokens per revisit
  └─ Total savings: ~6500 tokens per revisit (~$0.05-0.15)

COST EXAMPLE (5 Job Applications, 3 Iterations Each):
  ├─ Initial setup: 5 × $0.25 = $1.25
  ├─ Iterations: 15 × $0.025 = $0.375
  ├─ Caching savings: 5 × $0.10 = -$0.50
  └─ Total: ~$1.125 (vs $2.50 without optimization)
```

---

## Summary

**Candid** is a sophisticated resume optimization platform that:

1. **Analyzes** job descriptions using LLMs to extract critical requirements
2. **Tailors** resumes to match specific jobs while preserving formatting
3. **Scores** resumes using ATS algorithms and LLM-based analysis
4. **Optimizes** individual sections with custom prompts
5. **Tracks** job applications and optimization history
6. **Minimizes** token usage through caching and tiered model selection
7. **Handles** multiple LLM providers with fallback strategies
8. **Provides** real-time feedback and actionable suggestions

The architecture balances **quality** (using better models for critical tasks), **cost** (using cheap models for analysis), and **speed** (caching and incremental updates) to deliver an optimal user experience.

