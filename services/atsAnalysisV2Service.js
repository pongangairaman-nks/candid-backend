/**
 * ATS Analysis Service V2
 * 
 * Handles:
 * 1. Analyzing resume against job description using LLM
 * 2. Returning ATS score + weak sections + missing keywords
 * 3. Identifying optimization opportunities
 */

const Anthropic = require('@anthropic-ai/sdk');

/**
 * Analyze resume against job description
 * Single LLM call returns: ATS score + weak sections + missing keywords
 * 
 * @param {string} jobDescription - Raw job description text
 * @param {Object} resumeContentJson - Extracted resume content JSON
 * @param {Object} userConfig - User's LLM config { apiKey, model }
 * @returns {Promise<Object>} - ATS analysis with score, weak sections, missing keywords
 */
async function analyzeResumeWithLLM(jobDescription, resumeContentJson, userConfig) {
  if (!jobDescription || jobDescription.trim().length === 0) {
    throw new Error('Job description cannot be empty');
  }

  if (!resumeContentJson) {
    throw new Error('Resume content JSON is required');
  }

  if (!userConfig || !userConfig.apiKey) {
    throw new Error('User LLM config is required');
  }

  const client = new Anthropic({ apiKey: userConfig.apiKey });
  const model = userConfig.model || 'claude-3-5-sonnet-latest';

  const systemPrompt = `You are an expert ATS (Applicant Tracking System) analyst and resume optimization specialist.

Your task is to analyze a resume against a job description and provide:
1. Overall ATS Score (0-100)
2. Analysis of strengths and weaknesses
3. Weak sections that need optimization
4. Missing keywords from the job description
5. Optimization priority order

Return ONLY valid JSON with this exact structure:
{
  "ats_score": <number 0-100>,
  "analysis": {
    "overall_match": "<brief description of overall fit>",
    "strengths": [
      "<strength 1>",
      "<strength 2>"
    ],
    "weaknesses": [
      "<weakness 1>",
      "<weakness 2>"
    ]
  },
  "weak_sections": [
    {
      "section_key": "<section_key from resume>",
      "section_name": "<human readable section name>",
      "match_percentage": <number 0-100>,
      "priority": "critical|high|medium|low",
      "reason": "<why this section is weak>",
      "missing_keywords": [
        "<keyword 1>",
        "<keyword 2>"
      ],
      "suggestion": "<specific suggestion for improvement>"
    }
  ],
  "missing_keywords": [
    "<keyword 1>",
    "<keyword 2>"
  ],
  "optimization_priority": [
    "<section_key_1>",
    "<section_key_2>"
  ]
}

IMPORTANT RULES:
1. Score reflects how well the resume matches the job description
2. Identify sections that are missing key job requirements
3. Weak sections should have match_percentage < 60%
4. Priority levels: critical (< 40%), high (40-60%), medium (60-80%), low (> 80%)
5. Missing keywords should be specific to the job description
6. Suggestions should be actionable and specific
7. Return ONLY valid JSON, no explanations`;

  const userPrompt = `Analyze this resume against the job description:

JOB DESCRIPTION:
${jobDescription}

RESUME CONTENT (JSON):
${JSON.stringify(resumeContentJson, null, 2)}

Provide a comprehensive ATS analysis with score, weak sections, and missing keywords.
Return ONLY the JSON object, no markdown, no explanations.`;

  try {
    console.log('📊 Analyzing resume with LLM...');

    const response = await client.messages.create({
      model,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    });

    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';

    if (!responseText) {
      throw new Error('Empty response from Claude');
    }

    // Parse JSON response
    let analysis;
    try {
      analysis = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ Failed to parse Claude response as JSON');
      console.error('Response:', responseText.substring(0, 500));
      throw new Error(`Invalid JSON response from Claude: ${parseError.message}`);
    }

    // Validate analysis structure
    const validation = validateAnalysis(analysis);
    if (!validation.isValid) {
      console.warn('⚠️ Analysis validation warnings:', validation.errors);
    }

    console.log(`✅ Analysis complete (Score: ${analysis.ats_score}/100)`);
    return analysis;
  } catch (error) {
    console.error('❌ ATS analysis error:', error.message);
    throw error;
  }
}

/**
 * Validate ATS analysis response structure
 * 
 * @param {Object} analysis - Analysis object to validate
 * @returns {Object} - { isValid: boolean, errors: string[] }
 */
function validateAnalysis(analysis) {
  const errors = [];

  // Validate ats_score
  if (typeof analysis.ats_score !== 'number') {
    errors.push('ats_score must be a number');
  } else if (analysis.ats_score < 0 || analysis.ats_score > 100) {
    errors.push('ats_score must be between 0 and 100');
  }

  // Validate analysis object
  if (!analysis.analysis) {
    errors.push('Missing analysis object');
  } else {
    if (!analysis.analysis.overall_match) {
      errors.push('Missing analysis.overall_match');
    }
    if (!Array.isArray(analysis.analysis.strengths)) {
      errors.push('analysis.strengths must be an array');
    }
    if (!Array.isArray(analysis.analysis.weaknesses)) {
      errors.push('analysis.weaknesses must be an array');
    }
  }

  // Validate weak_sections
  if (!Array.isArray(analysis.weak_sections)) {
    errors.push('weak_sections must be an array');
  } else {
    analysis.weak_sections.forEach((section, index) => {
      if (!section.section_key) {
        errors.push(`weak_sections[${index}] missing section_key`);
      }
      if (!section.section_name) {
        errors.push(`weak_sections[${index}] missing section_name`);
      }
      if (typeof section.match_percentage !== 'number') {
        errors.push(`weak_sections[${index}] match_percentage must be a number`);
      }
      if (!['critical', 'high', 'medium', 'low'].includes(section.priority)) {
        errors.push(`weak_sections[${index}] invalid priority: ${section.priority}`);
      }
      if (!Array.isArray(section.missing_keywords)) {
        errors.push(`weak_sections[${index}] missing_keywords must be an array`);
      }
    });
  }

  // Validate missing_keywords
  if (!Array.isArray(analysis.missing_keywords)) {
    errors.push('missing_keywords must be an array');
  }

  // Validate optimization_priority
  if (!Array.isArray(analysis.optimization_priority)) {
    errors.push('optimization_priority must be an array');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Calculate match percentage for a section
 * Based on keyword presence and content length
 * 
 * @param {Object} section - Resume section
 * @param {Array} jobKeywords - Keywords from job description
 * @returns {number} - Match percentage (0-100)
 */
function calculateSectionMatchPercentage(section, jobKeywords) {
  if (!section || !jobKeywords || jobKeywords.length === 0) {
    return 0;
  }

  let sectionText = '';

  // Extract text from section
  if (section.type === 'text' && section.content) {
    sectionText = section.content;
  } else if (section.type === 'list' && Array.isArray(section.items)) {
    sectionText = section.items
      .map(item => {
        if (item.content) return item.content;
        if (item.bullets) return item.bullets.map(b => b.content).join(' ');
        return Object.values(item).join(' ');
      })
      .join(' ');
  }

  if (!sectionText) {
    return 0;
  }

  // Count keyword matches (case-insensitive)
  const lowerText = sectionText.toLowerCase();
  let matchCount = 0;

  jobKeywords.forEach(keyword => {
    const lowerKeyword = keyword.toLowerCase();
    if (lowerText.includes(lowerKeyword)) {
      matchCount++;
    }
  });

  // Calculate percentage
  const matchPercentage = (matchCount / jobKeywords.length) * 100;

  return Math.min(100, Math.round(matchPercentage));
}

/**
 * Extract keywords from job description
 * Simple keyword extraction based on common patterns
 * 
 * @param {string} jobDescription - Job description text
 * @returns {Array} - Array of extracted keywords
 */
function extractKeywordsFromJD(jobDescription) {
  if (!jobDescription) return [];

  const keywords = [];

  // Common tech keywords to look for
  const techKeywords = [
    'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust',
    'React', 'Vue', 'Angular', 'Node.js', 'Express', 'Django', 'Flask',
    'PostgreSQL', 'MongoDB', 'Redis', 'Elasticsearch', 'MySQL',
    'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform',
    'Git', 'CI/CD', 'Jenkins', 'GitHub Actions', 'GitLab CI',
    'REST', 'GraphQL', 'API', 'Microservices', 'Distributed Systems',
    'Machine Learning', 'AI', 'Data Science', 'Analytics',
    'Agile', 'Scrum', 'Kanban', 'DevOps'
  ];

  // Extract matching keywords
  techKeywords.forEach(keyword => {
    if (jobDescription.toLowerCase().includes(keyword.toLowerCase())) {
      keywords.push(keyword);
    }
  });

  // Extract years of experience requirement
  const yearsMatch = jobDescription.match(/(\d+)\+?\s*years?/gi);
  if (yearsMatch) {
    keywords.push(...yearsMatch);
  }

  // Extract role-specific terms
  const roleTerms = ['senior', 'junior', 'lead', 'architect', 'engineer', 'developer', 'manager'];
  roleTerms.forEach(term => {
    if (jobDescription.toLowerCase().includes(term)) {
      keywords.push(term.charAt(0).toUpperCase() + term.slice(1));
    }
  });

  // Remove duplicates
  return [...new Set(keywords)];
}

/**
 * Get section key from section name
 * Maps human-readable names to JSON keys
 * 
 * @param {string} sectionName - Human-readable section name
 * @returns {string} - Section key
 */
function getSectionKeyFromName(sectionName) {
  const nameToKeyMap = {
    'Professional Summary': 'summary',
    'Summary': 'summary',
    'Core Skills': 'skills',
    'Skills': 'skills',
    'Professional Experience': 'experience',
    'Experience': 'experience',
    'Projects': 'projects',
    'Education': 'education',
    'Certifications': 'certifications'
  };

  return nameToKeyMap[sectionName] || sectionName.toLowerCase().replace(/\s+/g, '_');
}

module.exports = {
  analyzeResumeWithLLM,
  validateAnalysis,
  calculateSectionMatchPercentage,
  extractKeywordsFromJD,
  getSectionKeyFromName
};
