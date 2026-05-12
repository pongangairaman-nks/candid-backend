# Resume Architecture Refactor - Implementation Plan

**Status**: Planning Phase
**Last Updated**: May 12, 2026
**Target**: Cost-efficient, token-optimized resume optimization with 80-90+ ATS score guarantee

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Summary](#architecture-summary)
3. [Backend Tasks](#backend-tasks)
4. [Frontend Tasks](#frontend-tasks)
5. [Database Schema Changes](#database-schema-changes)
6. [API Endpoints](#api-endpoints)
7. [Implementation Phases](#implementation-phases)
8. [Key Decisions](#key-decisions)

---

## 🎯 Project Overview

### Goal

Separate LaTeX formatting from resume content to enable:

- **Cost Efficiency**: 60-70% reduction in token usage
- **Deterministic Output**: Template-based rendering eliminates formatting breakage
- **Iterative Optimization**: Resume optimized until 80-90+ ATS score
- **Content Preservation**: Meaning and metrics preserved during optimization
- **Scalability**: Easier to add features without LLM changes

### Scope

- Convert master resume LaTeX → JSON + Handlebars template
- Implement LLM-based ATS analysis (single call for score + weak sections)
- Iterative optimization until 80-90+ score (max 3 iterations)
- Cost-optimized over speed (development phase)
- Existing data can be deleted (dev phase only)

### Key Constraints

- Max 3 optimization iterations
- Target score: 80-90+
- Stop early if score reached on iteration 1
- Preserve content meaning and metrics
- No LaTeX corruption

---

## 🏗️ Architecture Summary

### Data Storage (3 Values per Master Resume)

```
1. whole_master_template
   - Original LaTeX uploaded by user
   - Can be updated, used for display in config page
   - Type: TEXT

2. extracted_content_json
   - Parsed resume content from LaTeX
   - Hierarchical structure with section keys
   - Type: JSONB
   - Example: { metadata: {...}, sections: { summary: {...}, experience: [...] } }

3. created_latex_template
   - Handlebars template with {{placeholders}}
   - Used to render final LaTeX from JSON
   - Type: TEXT
   - Example: \section{Summary} {{sections.summary.content}}
```

### Frontend-Backend Flow

```
CONFIG PAGE:
  User uploads LaTeX
    ↓
  POST /api/v2/resume/upload-master
    ↓
  Backend extracts JSON + creates template
    ↓
  Frontend displays: whole_master_template

OPTIMIZATION SCREEN:
  GET /api/v2/resume/master
    ↓
  Frontend receives: extracted_content_json + created_latex_template
    ↓
  Frontend renders: Handlebars.compile(template)(json)
    ↓
  User pastes job description
    ↓
  POST /api/v2/resume/analyze
    ↓
  Backend analyzes (LLM): returns ATS score + weak sections
    ↓
  Frontend displays: ATS score + weak sections
    ↓
  User clicks "Optimize to 80-90+"
    ↓
  POST /api/v2/resume/optimize-to-target
    ↓
  Backend iteratively optimizes (max 3 iterations)
    ├─ Iteration 1: Analyze → If score >= 80: STOP
    ├─ Iteration 2: Optimize + Analyze → If score >= 80: STOP
    └─ Iteration 3: Optimize + Analyze → STOP (max reached)
    ↓
  Backend renders final LaTeX
    ↓
  Returns: final_latex + optimized_content_json + score + history
    ↓
  Frontend displays: Updated resume + ATS score + optimization history
    ↓
  User clicks "Preview PDF"
    ↓
  PDF generated and displayed
```

### Key Design Decisions

1. **JD Input**: Send complete raw JD (not parsed)

   - Reason: LLM understands full context better
   - Preserves nuances and implicit requirements
2. **ATS Analysis**: Single LLM call returns score + weak sections

   - Cost: ~1000 tokens (~$0.01 with Claude Haiku)
   - Benefit: Accurate, context-aware analysis
3. **Iterative Optimization**: Loop until 80-90+ score

   - Early exit if score >= 80 on iteration 1
   - Max 3 iterations (cost-efficient)
   - Plateau detection (stop if improvement < 2%)
4. **Frontend Rendering**: Handlebars template compiled on frontend

   - Reduces backend load
   - Faster UI updates
   - Allows local re-rendering without API calls
5. **Content Preservation**: Explicit LLM instructions

   - Preserve meaning and achievements
   - Preserve metrics and numbers
   - Only add/integrate keywords naturally
   - No false claims or exaggeration

---

## 📝 Backend Tasks

### Phase 1: Foundation (JSON Schema, Template Extraction, Rendering)

#### Task 1.1: Create Resume JSON Schema

- [ ] Define hierarchical JSON structure for resume content
- [ ] Include sections: metadata, summary, skills, experience, projects, education, certifications
- [ ] Each section has type (text/list) and content
- [ ] Experience items have bullets with individual IDs
- [ ] Document schema in code comments

**Files to Create:**

- `server/schemas/resumeContentSchema.js` - JSON schema definition

**Files to Modify:**

- None

---

#### Task 1.2: Create Resume Parser Service

- [ ] Implement `extractJsonFromLatex()` - Parse LaTeX → JSON using Claude
- [ ] Implement `convertLatexToTemplate()` - Convert LaTeX → Handlebars template
- [ ] Implement `validateTemplate()` - Validate Handlebars syntax
- [ ] Handle edge cases (missing sections, malformed LaTeX)
- [ ] Add error handling and logging

**Files to Create:**

- `server/services/resumeParserService.js`

**Files to Modify:**

- None

---

#### Task 1.3: Create Resume Renderer Service

- [ ] Implement `renderLatex()` - Render LaTeX from template + JSON
- [ ] Implement `validateLatex()` - Validate rendered LaTeX
- [ ] Check for `\documentclass`, `\begin{document}`, `\end{document}`
- [ ] Check for balanced braces and environments
- [ ] Add error handling

**Files to Create:**

- `server/services/resumeRenderService.js`

**Files to Modify:**

- None

---

#### Task 1.4: Create Resume V2 Routes

- [ ] `POST /api/v2/resume/upload-master` - Upload LaTeX, extract JSON, create template
- [ ] `GET /api/v2/resume/master` - Fetch master resume (JSON + template)
- [ ] `POST /api/v2/resume/render` - Render LaTeX from template + JSON
- [ ] Add authentication middleware
- [ ] Add error handling and validation

**Files to Create:**

- `server/routes/resumeV2.js`

**Files to Modify:**

- `server/server.js` - Register new routes

---

#### Task 1.5: Update Database Schema

- [ ] Add new columns to resumes table: `whole_master_template`, `extracted_content_json`, `created_latex_template`, `optimized_content_json`, `final_latex`, `template_version`
- [ ] Note: No migration script needed (dev phase, can delete existing data)

**Files to Create:**

- None

**Files to Modify:**

- None (manual database update or use raw SQL)

---

### Phase 2: LLM-based ATS Analysis (Single Call for Score + Weak Sections)

#### Task 2.1: Create ATS Analysis Service V2

- [ ] Implement `analyzeResumeWithLLM()` - Analyze resume against JD
- [ ] Returns: ATS score + weak sections + missing keywords + suggestions
- [ ] Send complete raw JD (not parsed)
- [ ] Use Claude Haiku for cost efficiency
- [ ] Validate response structure
- [ ] Add error handling

**Files to Create:**

- `server/services/atsAnalysisV2Service.js`

**Files to Modify:**

- None

---

#### Task 2.2: Create ATS Analysis Route

- [ ] `POST /api/v2/resume/analyze` - Analyze resume + JD
- [ ] Input: jobDescription, extractedContentJson
- [ ] Output: ATS score, weak sections, missing keywords, optimization priority
- [ ] Call LLM-based analysis
- [ ] Store analysis in database
- [ ] Add error handling

**Files to Create:**

- None (add to resumeV2.js)

**Files to Modify:**

- `server/routes/resumeV2.js`

---

### Phase 3: Iterative Optimization (Weak Sections Only)

#### Task 3.1: Create Iterative Optimization Service

- [ ] Implement `optimizeUntilTarget()` - Main optimization loop
- [ ] Target score: 80-90+
- [ ] Max iterations: 3
- [ ] Early exit if score >= 80 on iteration 1
- [ ] Plateau detection (stop if improvement < 2%)
- [ ] Track optimization history
- [ ] Add logging and error handling

**Files to Create:**

- `server/services/iterativeOptimizationService.js`

**Files to Modify:**

- None

---

#### Task 3.2: Create Weak Section Optimization Service

- [ ] Implement `optimizeWeakSectionsV2()` - Optimize weak sections
- [ ] Iteration-aware prompts (different for iteration 1, 2, 3)
- [ ] Sort sections by priority (critical → high → medium → low)
- [ ] Preserve meaning and metrics
- [ ] Integrate keywords naturally
- [ ] Add error handling

**Files to Create:**

- `server/services/weakSectionOptimizationService.js`

**Files to Modify:**

- None

---

#### Task 3.3: Create Optimization Prompt Builder

- [ ] Implement `createOptimizationPrompt()` - Build iteration-aware prompts
- [ ] Include: current match %, missing keywords, job description, current section
- [ ] Iteration 1: Focus on keyword integration
- [ ] Iteration 2+: Focus on deeper keyword integration and rephrasing
- [ ] Explicit instructions: preserve meaning, preserve metrics, no false claims

**Files to Create:**

- `server/services/optimizationPromptService.js`

**Files to Modify:**

- None

---

#### Task 3.4: Create Optimization Route

- [ ] `POST /api/v2/resume/optimize-to-target` - Iteratively optimize resume
- [ ] Input: extractedContentJson, jobDescription, targetScore (optional)
- [ ] Output: optimized_content_json, final_latex, final_ats_score, iterations, history
- [ ] Long-running operation (30-60 seconds)
- [ ] Render final LaTeX
- [ ] Validate LaTeX
- [ ] Store in database
- [ ] Add error handling

**Files to Create:**

- None (add to resumeV2.js)

**Files to Modify:**

- `server/routes/resumeV2.js`

---

### Phase 4: Cost Optimization (Model Switching, Token Tracking)

#### Task 4.1: Create Token Usage Tracking Service

- [ ] Implement `logTokenUsage()` - Log every LLM call
- [ ] Track: user_id, phase, model, input_tokens, output_tokens, cost_usd
- [ ] Calculate cost based on model pricing
- [ ] Add aggregation queries for usage stats

**Files to Create:**

- `server/services/tokenTrackingService.js`

**Files to Modify:**

- None

---

#### Task 4.2: Create Token Usage Table

- [ ] Create `llm_usage_logs` table
- [ ] Columns: id, user_id, phase, model, input_tokens, output_tokens, cost_usd, created_at
- [ ] Add indexes: (user_id, created_at), (phase)

**Files to Create:**

- `server/migrations/004_llm_usage_logs.sql`

**Files to Modify:**

- None

---

#### Task 4.3: Integrate Token Tracking

- [ ] Add token logging to all LLM calls
- [ ] Track in: analyzeResumeWithLLM, optimizeWeakSectionsV2
- [ ] Include in API responses (optional)
- [ ] Create usage stats endpoint (optional)

**Files to Create:**

- None

**Files to Modify:**

- `server/services/atsAnalysisV2Service.js`
- `server/services/weakSectionOptimizationService.js`
- `server/routes/resumeV2.js`

---

#### Task 4.4: Update LLM Config for Model Selection

- [ ] Support Haiku for analysis (cheap)
- [ ] Support Sonnet for optimization (balanced)
- [ ] Add model selection in configuration
- [ ] Validate model availability

**Files to Create:**

- None

**Files to Modify:**

- `server/routes/llmConfig.js`

---

## 🎨 Frontend Tasks

### Phase 1: Foundation (Master Resume Upload, Template Rendering)

#### Task F1.1: Create Resume Rendering Hook

- [ ] Implement `useResumeRenderer()` hook
- [ ] Compile Handlebars template locally
- [ ] Render LaTeX from template + JSON
- [ ] Handle errors gracefully
- [ ] Memoize compiled template for performance

**Files to Create:**

- `app/src/hooks/useResumeRenderer.ts`

**Files to Modify:**

- None

---

#### Task F1.2: Update Optimization Screen

- [ ] Fetch master resume (JSON + template) on mount
- [ ] Render LaTeX locally using hook
- [ ] Display in editor
- [ ] Allow editing JSON (optional)
- [ ] Show real-time LaTeX preview

**Files to Create:**

- None

**Files to Modify:**

- `app/src/components/OptimizedResumeEditor.tsx`

---

#### Task F1.3: Update Zustand Store

- [ ] Add new state: wholeMasterTemplate, extractedContentJson, createdLatexTemplate
- [ ] Add new state: optimizedContentJson, finalLatex
- [ ] Add methods: uploadMaster, loadMaster, renderLatex
- [ ] Persist to localStorage

**Files to Create:**

- None

**Files to Modify:**

- `app/src/store/resumeStore.ts`

---

### Phase 2: ATS Analysis Display

#### Task F1.4: Create ATS Analysis Component

- [ ] Display ATS score (0-100) with visual gauge
- [ ] Show strengths (list)
- [ ] Show weaknesses (list)
- [ ] Show weak sections with priority badges
- [ ] Show missing keywords
- [ ] Show optimization suggestions

**Files to Create:**

- `app/src/components/ATSAnalysisDisplay.tsx`

**Files to Modify:**

- None

---

#### Task F1.5: Create Analyze Button Handler

- [ ] Call `POST /api/v2/resume/analyze`
- [ ] Input: jobDescription, extractedContentJson
- [ ] Handle loading state
- [ ] Display analysis results
- [ ] Show error messages
- [ ] Enable "Optimize to 80-90+" button

**Files to Create:**

- None

**Files to Modify:**

- `app/src/components/OptimizedResumeEditor.tsx`

---

### Phase 3: Iterative Optimization Display

#### Task F1.6: Create Optimization Progress Component

- [ ] Show optimization progress (iteration X/3)
- [ ] Display current ATS score
- [ ] Show optimization history (score per iteration)
- [ ] Show status: "Analyzing...", "Optimizing...", "Complete"
- [ ] Disable user interactions during optimization

**Files to Create:**

- `app/src/components/OptimizationProgress.tsx`

**Files to Modify:**

- None

---

#### Task F1.7: Create Optimize Button Handler

- [ ] Call `POST /api/v2/resume/optimize-to-target`
- [ ] Input: extractedContentJson, jobDescription
- [ ] Handle long-running operation (30-60 seconds)
- [ ] Show progress updates
- [ ] Update resume on completion
- [ ] Show optimization history
- [ ] Show success/error messages

**Files to Create:**

- None

**Files to Modify:**

- `app/src/components/OptimizedResumeEditor.tsx`

---

#### Task F1.8: Display Optimization Results

- [ ] Show final ATS score
- [ ] Show iterations completed
- [ ] Show optimization history (score per iteration)
- [ ] Show message: "Reached 85/100 in 2 iterations"
- [ ] Update resume editor with final LaTeX
- [ ] Enable "Preview PDF" button

**Files to Create:**

- None

**Files to Modify:**

- `app/src/components/OptimizedResumeEditor.tsx`

---

### Phase 4: Polish & Error Handling

#### Task F1.9: Error Handling

- [ ] Handle network errors
- [ ] Handle timeout errors (long optimization)
- [ ] Handle validation errors
- [ ] Show user-friendly error messages
- [ ] Provide retry options

**Files to Create:**

- None

**Files to Modify:**

- `app/src/components/OptimizedResumeEditor.tsx`
- `app/src/services/api.ts`

---

#### Task F1.10: Loading States

- [ ] Show loading spinner during analysis
- [ ] Show loading spinner during optimization
- [ ] Disable buttons during operations
- [ ] Show progress percentage (if available)

**Files to Create:**

- None

**Files to Modify:**

- `app/src/components/OptimizedResumeEditor.tsx`

---

#### Task F1.11: Toast Notifications

- [ ] Show success toast on upload
- [ ] Show success toast on analysis
- [ ] Show success toast on optimization
- [ ] Show error toast on failures
- [ ] Include details in toast messages

**Files to Create:**

- None

**Files to Modify:**

- `app/src/components/OptimizedResumeEditor.tsx`

---

## 🗄️ Database Schema Changes

### Add Columns to Resumes Table

```sql
-- Add new columns to resumes table
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS whole_master_template TEXT;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS extracted_content_json JSONB;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS created_latex_template TEXT;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS optimized_content_json JSONB;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS final_latex TEXT;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS template_version VARCHAR(10) DEFAULT '1.0';
```

### LLM Usage Logs Table

```sql
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

CREATE INDEX idx_llm_usage_logs_user_created 
ON llm_usage_logs(user_id, created_at);

CREATE INDEX idx_llm_usage_logs_phase 
ON llm_usage_logs(phase);
```

---

## 🔌 API Endpoints

### Phase 1 Endpoints

#### `POST /api/v2/resume/upload-master`

**Purpose**: Upload LaTeX resume, extract JSON, create template

**Request**:

```json
{
  "latexContent": "\\documentclass{article}..."
}
```

**Response**:

```json
{
  "status": "success",
  "data": {
    "whole_master_template": "\\documentclass{article}...",
    "extracted_content_json": { "metadata": {...}, "sections": {...} },
    "created_latex_template": "\\documentclass{article}...{{metadata.name}}..."
  }
}
```

---

#### `GET /api/v2/resume/master`
**Purpose**: Fetch master resume (JSON + template) for optimization screen

**Response**:
```json
{
  "status": "success",
  "data": {
    "extracted_content_json": { ... },
    "created_latex_template": "..."
  }
}
```

**Usage**: Frontend calls this on optimization screen load to get the resume content and template for rendering

---

### Phase 2 Endpoints

#### `POST /api/v2/resume/analyze`

**Purpose**: Analyze resume against JD, return ATS score + weak sections

**Request**:

```json
{
  "jobDescription": "...",
  "extractedContentJson": { ... }
}
```

**Response**:

```json
{
  "status": "success",
  "data": {
    "ats_score": 65,
    "analysis": {
      "overall_match": "Good match with some gaps",
      "strengths": [...],
      "weaknesses": [...]
    },
    "weak_sections": [
      {
        "section_key": "experience.exp_1",
        "section_name": "Unacademy Experience",
        "match_percentage": 45,
        "priority": "critical",
        "reason": "Missing Kubernetes and Docker mentions",
        "missing_keywords": ["Kubernetes", "Docker"],
        "suggestion": "..."
      }
    ],
    "missing_keywords": [...],
    "optimization_priority": ["summary", "experience.exp_1"]
  }
}
```

---

### Phase 3 Endpoints

#### `POST /api/v2/resume/optimize-to-target`

**Purpose**: Iteratively optimize resume until 80-90+ ATS score

**Request**:

```json
{
  "extractedContentJson": { ... },
  "jobDescription": "...",
  "targetScore": 90
}
```

**Response**:

```json
{
  "status": "success",
  "data": {
    "optimized_content_json": { ... },
    "final_latex": "\\documentclass{article}...",
    "final_ats_score": 87,
    "target_reached": true,
    "iterations": 2,
    "optimization_history": [
      { "iteration": 1, "score": 65, "weak_sections": 4 },
      { "iteration": 2, "score": 87, "weak_sections": 1 }
    ],
    "duration_seconds": 45,
    "message": "✅ Reached target score of 90+ in 2 iterations"
  }
}
```

---

## 📅 Implementation Phases

### Phase 1: Foundation (1-2 weeks)

**Goal**: JSON schema, template extraction, rendering, ATS analysis, optimization

**Backend Tasks**:

- [ ] 1.1: Create Resume JSON Schema
- [ ] 1.2: Create Resume Parser Service
- [ ] 1.3: Create Resume Renderer Service
- [ ] 1.4: Create Resume V2 Routes
- [ ] 1.5: Update Database Schema
- [ ] 2.1: Create ATS Analysis Service V2
- [ ] 2.2: Create ATS Analysis Route
- [ ] 3.1: Create Iterative Optimization Service
- [ ] 3.2: Create Weak Section Optimization Service
- [ ] 3.3: Create Optimization Prompt Builder
- [ ] 3.4: Create Optimization Route

**Frontend Tasks**:

- [ ] F1.1: Create Resume Rendering Hook
- [ ] F1.2: Update Optimization Screen
- [ ] F1.3: Update Zustand Store
- [ ] F1.4: Create ATS Analysis Component
- [ ] F1.5: Create Analyze Button Handler
- [ ] F1.6: Create Optimization Progress Component
- [ ] F1.7: Create Optimize Button Handler
- [ ] F1.8: Display Optimization Results
- [ ] F1.9: Error Handling
- [ ] F1.10: Loading States
- [ ] F1.11: Toast Notifications

**Deliverable**: Full resume optimization flow (upload → analyze → optimize to 80-90+)

---

### Phase 2: Cost Optimization (1 week)

**Goal**: Model switching, token tracking

**Backend Tasks**:

- [ ] 4.1: Create Token Usage Tracking Service
- [ ] 4.2: Create Token Usage Table
- [ ] 4.3: Integrate Token Tracking
- [ ] 4.4: Update LLM Config for Model Selection

**Deliverable**: Full system with cost tracking and error handling

---

## 🔑 Key Decisions

### 1. JD Input Format

**Decision**: Send complete raw JD (not parsed)
**Reason**: LLM understands full context better, preserves nuances
**Trade-off**: +100-200 tokens, but better accuracy

### 2. ATS Analysis Approach

**Decision**: Single LLM call returns score + weak sections
**Reason**: Cost-efficient, accurate, context-aware
**Cost**: ~1000 tokens (~$0.01 with Claude Haiku)

### 3. Optimization Loop

**Decision**: Iterate until 80-90+ score (max 3 iterations)
**Reason**: Guarantees good resume quality, cost-efficient
**Early Exit**: Stop if score >= 80 on iteration 1
**Plateau Detection**: Stop if improvement < 2%

### 4. Frontend Rendering

**Decision**: Handlebars template compiled on frontend
**Reason**: Reduces backend load, faster UI updates, local re-rendering
**Trade-off**: Requires Handlebars.js library (~10KB)

### 5. Content Preservation

**Decision**: Explicit LLM instructions in prompts
**Reason**: Ensures meaning and metrics are preserved
**Validation**: Prompt explicitly forbids false claims, exaggeration

### 6. Model Selection

**Decision**: Haiku for analysis, Sonnet for optimization
**Reason**: Cost-efficient (Haiku ~$0.80/1M tokens, Sonnet ~$3/1M tokens)
**Trade-off**: Slightly slower, but acceptable for development phase

### 7. No JD Caching

**Decision**: Send raw JD directly to LLM, no parsing or caching
**Reason**: Simpler implementation, LLM understands full context better
**Trade-off**: Slight cost increase if same JD analyzed multiple times, but acceptable

---

## 📊 Cost Estimation

### Per Resume Optimization (3 iterations to 90+)

```
Iteration 1:
  - Analyze: ~1000 tokens
  - Optimize 3 sections: ~2000 tokens
  - Total: ~3000 tokens

Iteration 2:
  - Analyze: ~1000 tokens
  - Optimize 2 sections: ~1500 tokens
  - Total: ~2500 tokens

Iteration 3:
  - Analyze: ~1000 tokens
  - Optimize 1 section: ~1000 tokens
  - Total: ~2000 tokens

Total: ~7500 tokens
Cost (Claude Haiku): ~$0.075
Time: ~45-60 seconds
```

### Savings vs Old Approach

```
Old Approach (full resume regeneration):
  - Per optimization: ~5000 tokens
  - Cost: ~$0.05
  - But score: 70-75 (not 90+)

New Approach (iterative optimization):
  - Per optimization: ~7500 tokens
  - Cost: ~$0.075
  - Score: 80-90+ (guaranteed)
  - Benefit: Better quality, guaranteed score
```

---

## ✅ Success Criteria

- [ ] Users can upload LaTeX resume
- [ ] Backend extracts JSON + creates template
- [ ] Frontend renders LaTeX from template + JSON
- [ ] Users can analyze resume (ATS score + weak sections)
- [ ] Users can optimize resume until 80-90+ score
- [ ] Max 3 iterations per optimization
- [ ] Early exit if score >= 80 on iteration 1
- [ ] Content meaning and metrics preserved
- [ ] No LaTeX corruption
- [ ] Token usage tracked
- [ ] All errors handled gracefully
- [ ] User-friendly error messages
- [ ] Loading states and progress indicators

---

## 🚀 Next Steps

1. **Review & Approve**: Confirm all tasks and decisions
2. **Start Phase 1**: Begin with JSON schema and parser service
3. **Test Incrementally**: Test each phase before moving to next
4. **Gather Feedback**: Iterate based on testing results
5. **Deploy**: Roll out to production after all phases complete

---

**Last Updated**: May 12, 2026
**Status**: Ready for Implementation
