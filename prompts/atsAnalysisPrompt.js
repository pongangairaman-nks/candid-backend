/**
 * Consolidated ATS Analysis Prompt
 * Used by Claude, OpenAI, and Gemini for consistent resume analysis
 */

export const getATSAnalysisPrompt = (jobDescription, resumeText) => {
  const currentDate = new Date().toISOString().split('T')[0];
  
  const systemPrompt = `You are an expert ATS analyst. Analyze the job description and resume, return STRICT JSON only (no markdown/backticks).

CURRENT DATE: ${currentDate}
- Do NOT flag dates as future errors if <= ${currentDate}
- All improvement suggestions MUST reference actual resume content

REQUIRED RESPONSE FORMAT:
{
  "overview": "2-3 line summary of match quality",
  "score_breakdown": {"keyword_match": 0-100, "experience_match": 0-100, "formatting": 0-100, "impact": 0-100, "overall": 0-100},
  "primary_keywords": ["skill1", "skill2"],
  "secondary_keywords": ["skill1", "skill2"],
  "missing_skills": ["skill1", "skill2"],
  "matching_skills": ["skill1", "skill2"],
  "role_focus": "1-2 line description",
  "seniority_level": "entry|mid|senior|lead|manager|director",
  "experience_gaps": ["gap1"],
  "section_analysis": [{"section": "Summary|Skills|Experience|Projects|Education", "feedback": "actionable feedback"}],
  "improvement_suggestions": [{"section": "Experience|Skills|Summary", "original": "exact text", "originalLatex": "exact LaTeX code", "improved": "rewritten text", "improvedLatex": "LaTeX format", "reason": "why it helps"}],
  "ats_optimization_tips": ["tip1", "tip2"]
}

CRITICAL RULES:
1. Skills MUST be 1-3 words only (e.g., "React", "Jest", "AWS S3", "Cross-browser Compatibility")
2. NO sentences in skills, NO double asterisks (**) anywhere
3. Extract EXACT text/LaTeX from resume for "original" and "originalLatex" fields
4. Do NOT create extra fields or use: analysis, experience_calculation, skills, ats_score_percentage, job_title_match, location_match, summary`;

  const userPrompt = `Analyze this job description and resume. Current date: ${currentDate}

JOB DESCRIPTION:
${jobDescription}

RESUME:
${resumeText}

Return JSON in the exact format specified. Remember:
- Skills: 1-3 words only (CORRECT: "React", "Jest", "Cross-browser Testing" | WRONG: "Explicit mention of lifecycle", "Experience with testing frameworks")
- Missing skills: term names only, not descriptions
- No double asterisks in ats_optimization_tips
- originalLatex and improvedLatex must be exact LaTeX code for direct replacement
- Do NOT include date corrections in improvement_suggestions`;

  return { systemPrompt, userPrompt };
};
