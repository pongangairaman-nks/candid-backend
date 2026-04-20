# Resume Automation Platform - Backend

A robust Node.js/Express server that powers the Resume Automation Platform with AI-driven resume analysis, customization, and ATS optimization.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Server](#running-the-server)
- [API Endpoints](#api-endpoints)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Authentication](#authentication)
- [Troubleshooting](#troubleshooting)

## Overview

This is the backend API server for the Resume Automation Platform. It handles:
- User authentication and authorization
- Resume upload and processing
- Job description analysis
- AI-powered resume customization using multiple LLM providers
- ATS (Applicant Tracking System) compatibility analysis
- PDF generation
- Database operations with PostgreSQL
- File storage with Firebase

## Features

- **User Management**: Signup, login, password reset, profile management
- **Resume Processing**: Upload, parse, and store resumes
- **Job Analysis**: Extract requirements from job descriptions
- **AI Integration**: Support for multiple LLM providers (OpenAI, Claude, Gemini)
- **Resume Customization**: Generate tailored resumes for specific jobs
- **ATS Optimization**: Analyze and improve ATS compatibility
- **PDF Generation**: Create downloadable PDF resumes
- **File Storage**: Secure file uploads to Firebase Storage
- **Rate Limiting**: Protect API from abuse
- **Logging**: Comprehensive request and error logging
- **Feature Flags**: Enable/disable features dynamically

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js 4.18.2
- **Database**: PostgreSQL (via Neon)
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcryptjs
- **File Upload**: Multer
- **File Storage**: Firebase Admin SDK
- **LLM Providers**: 
  - OpenAI (GPT models)
  - Anthropic Claude
  - Google Gemini
- **PDF Processing**: pdf-parse, node-latex, jsPDF
- **Logging**: Winston with daily rotation
- **Rate Limiting**: express-rate-limit
- **Email**: Nodemailer
- **Validation**: Validator.js

## Prerequisites

Before you begin, ensure you have:
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **PostgreSQL**: v12 or higher (or use Neon cloud database)
- **Git**: For version control
- **API Keys**: OpenAI, Claude, and/or Gemini (optional, at least one required)
- **Firebase Project**: For file storage

Verify Node.js installation:
```bash
node --version
npm --version
```

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Resume-Automation/server
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Verify Installation

```bash
npm list
```

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```bash
# Server Configuration
PORT=10000
NODE_ENV=development

# Database Configuration (Neon PostgreSQL)
DATABASE_URL=postgresql://username:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require

# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email
FIREBASE_STORAGE_BUCKET=your-bucket.appspot.com

# LLM API Keys (at least one required)
OPENAI_API_KEY=your-openai-api-key
CLAUDE_API_KEY=your-claude-api-key
GEMINI_API_KEY=your-gemini-api-key

# Email Configuration (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRY=7d

# Application Settings
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:3000
```

### Setting Up Environment Variables

1. **Copy the example file**:
   ```bash
   cp .env.example .env
   ```

2. **Update with your credentials**:
   - Database URL from Neon
   - Firebase credentials from Firebase Console
   - API keys from respective providers

3. **Verify the file**:
   ```bash
   cat .env
   ```

## Running the Server

### Development Mode

Start the server with automatic restart on file changes:

```bash
npm run dev
```

The server will start on `http://localhost:10000`

### Production Mode

Build and start for production:

```bash
npm start
```

### Health Check

Verify the server is running:

```bash
curl http://localhost:10000/api/ping
```

Expected response:
```json
{
  "status": "success",
  "message": "Server is running"
}
```

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Register new user |
| POST | `/api/auth/login` | Login user |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password with token |
| POST | `/api/auth/verify-email` | Verify email address |
| GET | `/api/auth/me` | Get current user (protected) |
| PUT | `/api/auth/profile` | Update user profile (protected) |

### Resume Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload` | Upload resume file |
| GET | `/api/resume` | Get user resumes (protected) |
| PUT | `/api/resume/:id` | Update resume (protected) |
| DELETE | `/api/resume/:id` | Delete resume (protected) |

### Analysis & Generation

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/analyze` | Analyze job description |
| POST | `/api/generate-resume` | Generate customized resume |
| POST | `/api/ats/analyze` | Analyze ATS compatibility |
| POST | `/api/generate-pdf` | Generate PDF resume |

### Health & Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ping` | Server health check |
| GET | `/api/llm/config` | Get LLM configuration |
| GET | `/api/llm-usage` | Get LLM usage statistics |

## Project Structure

```
server/
├── config/                 # Configuration files
│   ├── database.js        # PostgreSQL connection
│   └── firebase.js        # Firebase initialization
├── middleware/            # Express middleware
│   ├── auth.js           # JWT authentication
│   ├── upload.js         # File upload handling
│   └── rateLimiter.js    # Rate limiting
├── routes/               # API route handlers
│   ├── auth.js          # Authentication routes
│   ├── resume.js        # Resume management
│   ├── analyze.js       # Job analysis
│   ├── generate.js      # Resume generation
│   ├── atsAnalysis.js   # ATS analysis
│   ├── pdf.js           # PDF generation
│   └── health.js        # Health checks
├── services/            # Business logic
│   ├── authService.js           # Auth operations
│   ├── atsService.js            # ATS analysis logic
│   ├── openaiService.js         # OpenAI integration
│   ├── claudeService.js         # Claude integration
│   ├── geminiService.js         # Gemini integration
│   ├── pdfService.js            # PDF generation
│   ├── fileService.js           # File operations
│   └── logger.js                # Logging setup
├── utils/               # Utility functions
│   ├── contentChunker.js        # Text chunking
│   └── sectionParser.js         # Resume parsing
├── prompts/             # LLM prompts
│   ├── defaultPrompt.js
│   └── atsAnalysisPrompt.js
├── migrations/          # Database migrations
├── uploads/             # Temporary file storage
├── logs/                # Application logs
├── server.js            # Main server file
├── .env                 # Environment variables
├── .env.example         # Example env file
├── package.json         # Dependencies
└── README.md           # This file
```

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `10000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://...` |
| `FIREBASE_PROJECT_ID` | Firebase project ID | `my-project` |
| `FIREBASE_PRIVATE_KEY` | Firebase private key | `-----BEGIN PRIVATE KEY-----...` |
| `FIREBASE_CLIENT_EMAIL` | Firebase client email | `firebase-adminsdk@...` |
| `FIREBASE_STORAGE_BUCKET` | Firebase storage bucket | `my-bucket.appspot.com` |

### LLM APIs (at least one required)

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for GPT models |
| `CLAUDE_API_KEY` | Anthropic Claude API key |
| `GEMINI_API_KEY` | Google Gemini API key |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `JWT_SECRET` | JWT signing secret | (auto-generated) |
| `JWT_EXPIRY` | Token expiration time | `7d` |
| `LOG_LEVEL` | Logging level | `info` |
| `CORS_ORIGIN` | CORS allowed origin | `http://localhost:3000` |
| `SMTP_HOST` | Email SMTP host | (optional) |
| `SMTP_PORT` | Email SMTP port | `587` |
| `SMTP_USER` | Email account | (optional) |
| `SMTP_PASS` | Email password | (optional) |

## Database Setup

### Using Neon (Recommended)

1. **Create a Neon project**:
   - Visit [neon.tech](https://neon.tech)
   - Sign up and create a new project
   - Copy the connection string

2. **Update `.env`**:
   ```bash
   DATABASE_URL=postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require
   ```

3. **Initialize database**:
   ```bash
   npm run dev
   ```
   The server will automatically create tables on startup.

### Using Local PostgreSQL

1. **Install PostgreSQL**:
   ```bash
   # macOS
   brew install postgresql
   
   # Ubuntu
   sudo apt-get install postgresql
   ```

2. **Create database**:
   ```bash
   createdb resume_automation
   ```

3. **Update `.env`**:
   ```bash
   DATABASE_URL=postgresql://localhost/resume_automation
   ```

### Database Tables

The server automatically creates these tables:
- `users` - User accounts and authentication
- `resumes` - Stored resumes
- `job_applications` - Job application tracking
- `feature_flags` - Feature toggle configuration
- `llm_usage` - LLM API usage tracking

## Authentication

### JWT Token Flow

1. **User logs in** → Server generates JWT token
2. **Token stored** → Client stores token in localStorage
3. **Protected requests** → Client sends token in Authorization header
4. **Token verified** → Server validates token on protected routes

### Token Format

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Token Expiration

- Default expiration: 7 days
- Configurable via `JWT_EXPIRY` environment variable

## Troubleshooting

### Server Won't Start

**Error**: `Port already in use`

```bash
# Find process using port
lsof -i :10000

# Kill process
kill -9 <PID>

# Or use different port
PORT=10001 npm run dev
```

### Database Connection Failed

**Error**: `connect ECONNREFUSED`

1. Verify database is running:
   ```bash
   psql -U postgres -h localhost
   ```

2. Check connection string in `.env`

3. Ensure database exists:
   ```bash
   psql -l
   ```

### API Keys Not Working

**Error**: `Invalid API key`

1. Verify API key in `.env`
2. Check key is not expired
3. Ensure correct key for the provider
4. Test key with provider's CLI tools

### File Upload Failing

**Error**: `Firebase storage error`

1. Verify Firebase credentials in `.env`
2. Check Firebase project has Storage enabled
3. Ensure storage bucket exists
4. Check file size limits (default: 50MB)

### CORS Errors

**Error**: `Access to XMLHttpRequest blocked by CORS`

1. Check `CORS_ORIGIN` in `.env`
2. Verify frontend URL matches
3. Restart server after changing CORS settings

### LLM Rate Limits

**Error**: `Rate limit exceeded`

1. Check API usage in provider dashboard
2. Implement request queuing
3. Use different LLM provider as fallback
4. Upgrade API plan if needed

## Development Tips

### Adding New Routes

1. Create route file in `routes/`
2. Define endpoints with proper error handling
3. Use authentication middleware for protected routes
4. Export router and import in `server.js`

### Adding New Services

1. Create service file in `services/`
2. Implement business logic
3. Use proper error handling
4. Export functions for use in routes

### Logging

```javascript
import logger from '../services/logger.js';

logger.info('Information message');
logger.warn('Warning message');
logger.error('Error message');
```

### Database Queries

```javascript
import { query } from '../config/database.js';

const result = await query('SELECT * FROM users WHERE id = $1', [userId]);
```

## Performance Optimization

- Connection pooling with pg
- Request caching where applicable
- Efficient database queries with indexes
- Rate limiting to prevent abuse
- Gzip compression for responses

## Security Best Practices

- JWT tokens for authentication
- Password hashing with bcryptjs
- Input validation with validator.js
- CORS configuration
- Rate limiting on sensitive endpoints
- Environment variables for secrets
- SQL injection prevention with parameterized queries

## Monitoring & Logging

Logs are stored in `logs/` directory with daily rotation:
- `combined.log` - All logs
- `error.log` - Error logs only

View logs:
```bash
tail -f logs/combined.log
```

## Getting Help

- Check the [troubleshooting section](#troubleshooting)
- Review API endpoint documentation
- Check server logs in `logs/` directory
- Verify all environment variables are set
- Test endpoints with curl or Postman

## License

ISC
