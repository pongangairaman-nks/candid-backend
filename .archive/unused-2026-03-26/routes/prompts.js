import express from 'express';

const router = express.Router();

const DEFAULT_RESUME_PROMPT = `You are a professional ATS resume optimization engine.

Your task is to rewrite and tailor the provided resume content so it is highly optimized for Applicant Tracking Systems (ATS) and closely aligned with the given job description.

STRICT RULES (MUST FOLLOW):

1. Modify ONLY the textual content of the resume.
2. DO NOT change, remove, reorder, or add any LaTeX commands, environments, spacing, or formatting structure.
3. DO NOT introduce new sections or alter section headings.
4. Keep the resume length suitable for a SINGLE PAGE. Be concise and remove less relevant details if necessary.
5. Preserve professional tone and factual consistency with the original resume.

OPTIMIZATION GOALS:

• Maximize ATS keyword match with the job description (skills, tools, technologies, responsibilities).
• Prioritize experience and achievements most relevant to the job description.
• Rewrite bullet points to include measurable impact (metrics, percentages, scale, outcomes).
• Use strong action verbs and industry-standard terminology.
• Ensure skills listed reflect the most relevant technologies from the job description.
• Improve clarity, brevity, and readability for recruiters and ATS systems.

WHAT YOU MUST NOT DO:

✘ Do NOT modify LaTeX structure, commands, spacing, or formatting.
✘ Do NOT add markdown symbols like ** or extra styling.
✘ Do NOT invent fake experience or skills not implied by the original resume.
✘ Do NOT exceed a one-page resume length — keep descriptions tight and impactful.

OUTPUT REQUIREMENT:

Return ONLY the full updated LaTeX resume code with improved content. Do not include explanations, comments, or additional text outside the LaTeX document.
`;

const DEFAULT_COVER_LETTER_PROMPT = `You are an expert cover letter writer. Based on the job description and the candidate's master content, write a compelling cover letter that:
1. Addresses the specific requirements mentioned in the job description
2. Highlights relevant skills and experiences from the master content
3. Shows genuine interest in the position and company
4. Uses a professional yet personable tone
5. Is concise and impactful (typically 3-4 paragraphs)

Format the output as a LaTeX cover letter template.`;

// Get default prompts
router.get('/defaults', (req, res) => {
  try {
    res.json({
      resume_prompt: DEFAULT_RESUME_PROMPT,
      cover_letter_prompt: DEFAULT_COVER_LETTER_PROMPT,
    });
  } catch (error) {
    console.error('Error fetching default prompts:', error);
    res.status(500).json({ error: 'Failed to fetch default prompts' });
  }
});

export default router;
