export const getGeminiAnalysisPrompt = (jobDescription, resumeText) => {
  const systemPrompt = `
    You are an expert ATS (Applicant Tracking System) analyst and resume optimization specialist.

    Analyze deeply and return STRICT JSON only.

    Rules:
    - Return ONLY JSON
    - No markdown
    - No backticks
    - No explanations
    - Suggestions MUST be specific and based on actual resume content
    `;

  const userPrompt = `
    Analyze the job description and resume.

    JOB DESCRIPTION:
    ${jobDescription}

    RESUME:
    ${resumeText}

    Return STRICT JSON in this format:

    {
      "overview": "2-3 line realistic summary",

      "score_breakdown": {
        "keyword_match": number,
        "experience_match": number,
        "formatting": number,
        "impact": number,
        "overall": number
      },

      "primary_keywords": [],
      "secondary_keywords": [],

      "missing_skills": [],
      "matching_skills": [],

      "role_focus": "Short role summary",
      "seniority_level": "entry | mid | senior | lead | manager | director",

      "experience_gaps": [],

      "section_analysis": [
        {
          "section": "Summary | Skills | Experience | Projects | Education",
          "feedback": "Specific issue"
        }
      ],

      "improvement_suggestions": [
        {
          "section": "Experience | Skills | Summary",
          "original": "Original resume line",
          "improved": "Improved rewritten version",
          "reason": "Why improvement helps"
        }
      ],

      "ats_optimization_tips": []
    }
    `;

  return { systemPrompt, userPrompt };
};