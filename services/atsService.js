import { analyzeJobDescription } from './geminiService.js';

/**
 * Industry-standard ATS Score Calculator
 * Scoring breakdown:
 * - Primary Keywords (40%): Must-have skills from job description
 * - Secondary Keywords (25%): Nice-to-have skills
 * - Matching Skills (15%): Skills present in both resume and JD
 * - Format Quality (10%): Resume structure and readability
 * - Seniority Alignment (10%): Experience level match
 */

/**
 * Calculate ATS score for a resume against job description
 * @param {string} resumeText - Extracted resume text
 * @param {string} jobDescription - Job description text
 * @param {Object} analysis - Gemini analysis results
 * @returns {Promise<Object>} ATS analysis with score and breakdown
 */
export const calculateATSScore = async (resumeText, jobDescription, analysis = null) => {
  try {
    // If analysis not provided, get it from Gemini
    let jobAnalysis = analysis;
    if (!jobAnalysis) {
      console.log('📊 Fetching job analysis from Gemini...');
      // Note: This would need userConfig passed in production
      // For now, we assume analysis is provided
      throw new Error('Job analysis required for ATS scoring');
    }

    const resumeTextLower = resumeText.toLowerCase();
    const scores = {};

    // 1. PRIMARY KEYWORDS SCORING (40% weight)
    const primaryKeywords = jobAnalysis.primary_keywords || [];
    const primaryMatches = primaryKeywords.filter(kw =>
      matchKeywordInText(resumeTextLower, kw.toLowerCase())
    );
    scores.primaryKeywords = {
      matched: primaryMatches.length,
      total: primaryKeywords.length,
      percentage: primaryKeywords.length > 0 ? (primaryMatches.length / primaryKeywords.length) * 100 : 0,
      weight: 0.40,
    };

    // 2. SECONDARY KEYWORDS SCORING (25% weight)
    const secondaryKeywords = jobAnalysis.secondary_keywords || [];
    const secondaryMatches = secondaryKeywords.filter(kw =>
      matchKeywordInText(resumeTextLower, kw.toLowerCase())
    );
    scores.secondaryKeywords = {
      matched: secondaryMatches.length,
      total: secondaryKeywords.length,
      percentage: secondaryKeywords.length > 0 ? (secondaryMatches.length / secondaryKeywords.length) * 100 : 0,
      weight: 0.25,
    };

    // 3. MATCHING SKILLS SCORING (15% weight)
    const matchingSkills = jobAnalysis.matching_skills || [];
    const missingSkills = jobAnalysis.missing_skills || [];
    const totalSkillsInJD = matchingSkills.length + missingSkills.length;
    scores.matchingSkills = {
      matched: matchingSkills.length,
      missing: missingSkills.length,
      total: totalSkillsInJD,
      percentage: totalSkillsInJD > 0 ? (matchingSkills.length / totalSkillsInJD) * 100 : 0,
      weight: 0.15,
    };

    // 4. FORMAT QUALITY SCORING (10% weight)
    scores.formatQuality = {
      score: validateResumeFormat(resumeText),
      weight: 0.10,
    };

    // 5. SENIORITY ALIGNMENT SCORING (10% weight)
    scores.seniorityAlignment = {
      score: validateSeniorityAlignment(resumeText, jobAnalysis.seniority_level),
      weight: 0.10,
    };

    // Calculate weighted total score
    const totalScore = Math.round(
      (scores.primaryKeywords.percentage * scores.primaryKeywords.weight) +
      (scores.secondaryKeywords.percentage * scores.secondaryKeywords.weight) +
      (scores.matchingSkills.percentage * scores.matchingSkills.weight) +
      (scores.formatQuality.score * scores.formatQuality.weight) +
      (scores.seniorityAlignment.score * scores.seniorityAlignment.weight)
    );

    // Determine ATS pass/fail status (industry standard: 70%+)
    const atsStatus = totalScore >= 70 ? 'pass' : totalScore >= 50 ? 'review' : 'fail';

    // Generate improvement suggestions
    const suggestions = generateImprovementSuggestions(scores, jobAnalysis, resumeText);

    console.log(`✅ ATS Score calculated: ${totalScore}% (${atsStatus})`);

    return {
      ats_score: totalScore,
      ats_status: atsStatus,
      breakdown: {
        primary_keywords: scores.primaryKeywords,
        secondary_keywords: scores.secondaryKeywords,
        matching_skills: scores.matchingSkills,
        format_quality: scores.formatQuality,
        seniority_alignment: scores.seniorityAlignment,
      },
      missing_skills: missingSkills,
      matching_skills: matchingSkills,
      optimization_tips: jobAnalysis.ats_optimization_tips || [],
      suggestions: suggestions,
      experience_gaps: jobAnalysis.experience_gaps || [],
      role_focus: jobAnalysis.role_focus,
      seniority_level: jobAnalysis.seniority_level,
    };
  } catch (error) {
    console.error('❌ ATS scoring error:', error.message);
    throw new Error(`Failed to calculate ATS score: ${error.message}`);
  }
};

/**
 * Match keyword in text with fuzzy matching
 * Handles variations like "React" matching "React.js", "ReactJS", etc.
 */
function matchKeywordInText(text, keyword) {
  // Exact match
  if (text.includes(keyword)) {
    return true;
  }

  // Fuzzy variations for common tech terms
  const variations = {
    'react': ['react.js', 'reactjs', 'react js'],
    'node': ['node.js', 'nodejs', 'node js'],
    'typescript': ['ts', 'typescript'],
    'javascript': ['js', 'javascript'],
    'python': ['py', 'python'],
    'aws': ['amazon web services', 'aws'],
    'gcp': ['google cloud', 'gcp'],
    'azure': ['microsoft azure', 'azure'],
    'docker': ['docker', 'containerization'],
    'kubernetes': ['k8s', 'kubernetes'],
    'sql': ['sql', 'mysql', 'postgresql', 'database'],
    'nosql': ['nosql', 'mongodb', 'dynamodb'],
    'rest': ['rest api', 'restful', 'rest'],
    'graphql': ['graphql', 'graph ql'],
    'ci/cd': ['ci/cd', 'cicd', 'continuous integration'],
    'agile': ['agile', 'scrum', 'kanban'],
    'git': ['git', 'github', 'gitlab', 'bitbucket'],
  };

  if (variations[keyword]) {
    return variations[keyword].some(v => text.includes(v));
  }

  return false;
}

/**
 * Validate resume format quality (0-100)
 * Checks for:
 * - Proper section headers
 * - Consistent formatting
 * - Readability
 */
function validateResumeFormat(resumeText) {
  let formatScore = 100;

  // Check for standard section headers
  const standardHeaders = ['experience', 'education', 'skills', 'contact', 'summary', 'projects'];
  const foundHeaders = standardHeaders.filter(header =>
    resumeText.toLowerCase().includes(header)
  );

  if (foundHeaders.length < 3) {
    formatScore -= 20; // Missing key sections
  }

  // Check for excessive special characters (indicates poor formatting)
  const specialCharCount = (resumeText.match(/[^a-zA-Z0-9\s\n\-.,()]/g) || []).length;
  if (specialCharCount > resumeText.length * 0.05) {
    formatScore -= 15; // Too many special characters
  }

  // Check for reasonable line length (not too long)
  const lines = resumeText.split('\n');
  const longLines = lines.filter(line => line.length > 150).length;
  if (longLines > lines.length * 0.3) {
    formatScore -= 10; // Too many long lines
  }

  // Check for consistent date formatting
  const datePattern = /(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\/\d{4}|[A-Za-z]+ \d{4})/g;
  const dates = resumeText.match(datePattern) || [];
  if (dates.length < 2) {
    formatScore -= 10; // Missing dates
  }

  return Math.max(0, Math.min(100, formatScore));
}

/**
 * Validate seniority level alignment (0-100)
 * Checks if resume experience matches job requirements
 */
function validateSeniorityAlignment(resumeText, requiredSeniority) {
  let alignmentScore = 50; // Base score

  const seniorityIndicators = {
    entry: ['intern', 'junior', 'graduate', 'entry-level', 'associate'],
    mid: ['mid-level', 'senior', 'lead', 'specialist', '3-5 years', '5-7 years'],
    senior: ['senior', 'principal', 'architect', 'manager', '7-10 years', '10+ years'],
    lead: ['lead', 'principal', 'director', 'head of', 'vp', 'chief'],
    manager: ['manager', 'director', 'head of', 'lead', 'team lead'],
    director: ['director', 'vp', 'chief', 'executive', 'c-level'],
  };

  const resumeTextLower = resumeText.toLowerCase();

  // Check for seniority indicators matching required level
  if (requiredSeniority && seniorityIndicators[requiredSeniority]) {
    const matchedIndicators = seniorityIndicators[requiredSeniority].filter(indicator =>
      resumeTextLower.includes(indicator)
    );

    if (matchedIndicators.length > 0) {
      alignmentScore = 85; // Good match
    }
  }

  // Check for years of experience mentions
  const yearsPattern = /(\d+)\s*(?:\+)?\s*years?/gi;
  const yearsMatches = resumeText.match(yearsPattern) || [];
  if (yearsMatches.length > 0) {
    alignmentScore = Math.min(100, alignmentScore + 10);
  }

  return Math.min(100, alignmentScore);
}

/**
 * Generate actionable improvement suggestions
 */
function generateImprovementSuggestions(scores, jobAnalysis, resumeText) {
  const suggestions = [];

  // Primary keywords suggestions
  if (scores.primaryKeywords.percentage < 80) {
    const missingPrimary = jobAnalysis.primary_keywords.filter(kw =>
      !resumeText.toLowerCase().includes(kw.toLowerCase())
    );
    if (missingPrimary.length > 0) {
      suggestions.push({
        priority: 'high',
        category: 'keywords',
        message: `Add these critical keywords: ${missingPrimary.slice(0, 3).join(', ')}`,
        impact: 'Will significantly improve ATS score',
      });
    }
  }

  // Missing skills suggestions
  if (jobAnalysis.missing_skills && jobAnalysis.missing_skills.length > 0) {
    suggestions.push({
      priority: 'high',
      category: 'skills',
      message: `Highlight experience with: ${jobAnalysis.missing_skills.slice(0, 3).join(', ')}`,
      impact: 'Directly addresses job requirements',
    });
  }

  // Format quality suggestions
  if (scores.formatQuality.score < 80) {
    suggestions.push({
      priority: 'medium',
      category: 'format',
      message: 'Ensure consistent formatting with standard section headers (Experience, Education, Skills)',
      impact: 'Improves ATS parsing accuracy',
    });
  }

  // Seniority alignment suggestions
  if (scores.seniorityAlignment.score < 70) {
    suggestions.push({
      priority: 'medium',
      category: 'experience',
      message: `Emphasize ${jobAnalysis.seniority_level || 'relevant'} level experience and achievements`,
      impact: 'Better alignment with role requirements',
    });
  }

  // Secondary keywords suggestions
  if (scores.secondaryKeywords.percentage < 60 && jobAnalysis.secondary_keywords.length > 0) {
    suggestions.push({
      priority: 'low',
      category: 'keywords',
      message: `Consider adding: ${jobAnalysis.secondary_keywords.slice(0, 2).join(', ')}`,
      impact: 'Nice-to-have skills that strengthen candidacy',
    });
  }

  return suggestions;
}

/**
 * Format ATS score for display
 */
export const formatATSResponse = (atsAnalysis) => {
  return {
    score: atsAnalysis.ats_score,
    status: atsAnalysis.ats_status,
    message: getATSStatusMessage(atsAnalysis.ats_score),
    breakdown: atsAnalysis.breakdown,
    suggestions: atsAnalysis.suggestions,
    tips: atsAnalysis.optimization_tips,
    gaps: atsAnalysis.experience_gaps,
  };
};

/**
 * Get human-readable status message
 */
function getATSStatusMessage(score) {
  if (score >= 85) {
    return '🟢 Excellent! Your resume is highly optimized for ATS systems.';
  } else if (score >= 70) {
    return '🟡 Good! Your resume should pass most ATS systems. Consider the suggestions to improve further.';
  } else if (score >= 50) {
    return '🟠 Fair. Your resume may be filtered by some ATS systems. Follow the suggestions to improve.';
  } else {
    return '🔴 Poor. Your resume needs significant improvements to pass ATS systems.';
  }
}
