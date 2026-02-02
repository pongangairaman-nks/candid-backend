/**
 * Gemini prompt for analyzing job descriptions and extracting keywords, skills, and role focus
 * @param {string} jobDescription - The job description text
 * @param {string} resumeText - The candidate's resume text
 * @returns {string} The formatted prompt for Gemini
 */
export const getGeminiAnalysisPrompt = (jobDescription, resumeText) => {
  return `You are an advanced ATS resume optimization and job description analysis engine.

Your task is to deeply analyze the JOB DESCRIPTION and compare it against the CANDIDATE'S RESUME to identify alignment gaps and optimization opportunities.

JOB DESCRIPTION:
${jobDescription}

CANDIDATE'S RESUME:
${resumeText}

Return your response ONLY as valid JSON in the exact structure below. Do not include markdown, commentary, or extra text.

{
  "primary_keywords": ["keyword1", "keyword2", "..."],
  "secondary_keywords": ["keyword1", "keyword2", "..."],
  "missing_skills": ["skill1", "skill2", "..."],
  "matching_skills": ["skill1", "skill2", "..."],
  "experience_gaps": ["gap1", "gap2", "..."],
  "role_focus": "1-2 sentence summary",
  "seniority_level": "entry | mid | senior | lead | manager | director",
  "ats_optimization_tips": [
    "tip1",
    "tip2",
    "tip3"
  ]
}

INSTRUCTIONS:

1. PRIMARY KEYWORDS
Extract 8–12 MUST-HAVE technical skills, tools, frameworks, or domain keywords that appear critical for this role.

2. SECONDARY KEYWORDS
Extract 5–10 NICE-TO-HAVE or supporting skills that strengthen a candidate but are not core requirements.

3. MISSING SKILLS
List 5–10 important skills, tools, or qualifications from the job description that do NOT appear in the candidate's resume text.
Only include skills that are explicitly mentioned or strongly implied in the JD.

4. MATCHING SKILLS
List key skills from the job description that ARE clearly present in the candidate's resume.

5. EXPERIENCE GAPS
Identify gaps such as:
• Missing domain experience (e.g., fintech, SaaS, healthcare)
• Missing responsibility areas (e.g., leadership, architecture, DevOps)
• Missing scale indicators (e.g., high traffic, enterprise systems)

6. ROLE FOCUS
Provide a concise summary of what the role is mainly about (e.g., "Frontend-heavy role focused on performance optimization and design systems in a SaaS environment.")

7. SENIORITY LEVEL
Infer the expected seniority level based on language in the job description.

8. ATS OPTIMIZATION TIPS
Provide 3–5 short, actionable suggestions to improve ATS alignment (e.g., "Add measurable impact to React projects", "Mention AWS services explicitly", etc.)

STRICT RULES:

• Do NOT invent skills that are not present in either the JD or resume.
• Base all outputs strictly on textual evidence.
• Keep items concise (1–4 words per keyword/skill).
• Avoid duplicates.
• Ensure the output is valid JSON.

Return ONLY the JSON object.`;
};
