import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Anthropic client
const anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY,
});

/**
 * Generate tailored resume using Claude while preserving LaTeX template structure
 * @param {string} originalLatex - The original LaTeX template
 * @param {Object} analysis - Gemini analysis results (keywords, missing_skills, role_focus)
 * @param {string} masterResumeText - Master resume text content
 * @param {string} jobDescription - Job description text
 * @returns {Promise<string>} Tailored LaTeX content
 */
export const tailorResumeContent = async (
    originalLatex,
    analysis,
    masterResumeText,
    jobDescription
) => {
    try {
        console.log('🤖 Calling Claude API for resume tailoring...');

        // Construct the prompt with CRITICAL instructions
        const systemPrompt = `You are an expert resume content editor specializing in LaTeX documents. Your ONLY job is to update the written content inside a LaTeX resume template to better match a job description.

CRITICAL RULES:
1. You MUST preserve the ENTIRE LaTeX structure, commands, packages, and formatting
2. You MUST NOT add, remove, or modify any LaTeX commands (\\documentclass, \\usepackage, \\begin, \\end, etc.)
3. You MUST NOT change spacing, margins, or layout commands
4. You MUST NOT add or remove sections
5. You MUST ONLY update the actual text content (job titles, descriptions, skills, achievements)
6. Return ONLY the complete LaTeX document with updated content
7. Do NOT include any explanations, markdown formatting, or code blocks
8. Do NOT add comments or notes

You are a CONTENT EDITOR, not a TEMPLATE DESIGNER.`;

        const userPrompt = `I need you to update the content of this LaTeX resume to better match the job description below.

JOB DESCRIPTION:
${jobDescription}

ROLE FOCUS:
${analysis.role_focus}

KEY KEYWORDS TO EMPHASIZE:
${analysis.keywords.join(', ')}

SKILLS TO INCORPORATE (if relevant to candidate's background):
${analysis.missing_skills.join(', ')}

MASTER RESUME CONTENT (for reference):
${masterResumeText}

ORIGINAL LaTeX TEMPLATE:
${originalLatex}

INSTRUCTIONS:
1. Update job descriptions, achievements, and skills to emphasize the keywords: ${analysis.keywords.slice(0, 5).join(', ')}
2. Reword bullet points to align with the role focus: "${analysis.role_focus}"
3. If the candidate has experience with any of these missing skills, highlight them: ${analysis.missing_skills.slice(0, 3).join(', ')}
4. Make the content more relevant to this specific job
5. Keep all changes subtle and professional
6. DO NOT change the LaTeX structure, commands, or formatting
7. DO NOT add or remove sections

Return ONLY the updated LaTeX document. No explanations, no markdown, no code blocks - just the raw LaTeX content.`;

        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 8000,
            temperature: 0.3, // Lower temperature for more consistent output
            system: systemPrompt,
            messages: [
                {
                    role: 'user',
                    content: userPrompt,
                },
            ],
        });

        // Extract the tailored LaTeX content
        const tailoredLatex = message.content[0].text;

        // Basic validation to ensure it's still LaTeX
        if (!tailoredLatex.includes('\\documentclass') && !tailoredLatex.includes('\\begin{document}')) {
            console.warn('⚠️  Warning: Response may not be valid LaTeX');
            // Try to extract LaTeX if Claude wrapped it in code blocks
            const latexMatch = tailoredLatex.match(/```(?:latex)?\n?([\s\S]*?)\n?```/);
            if (latexMatch) {
                console.log('📝 Extracted LaTeX from code block');
                return latexMatch[1];
            }
        }

        console.log('✅ Claude tailoring complete');
        console.log(`  Original length: ${originalLatex.length} chars`);
        console.log(`  Tailored length: ${tailoredLatex.length} chars`);

        return tailoredLatex;

    } catch (error) {
        console.error('❌ Claude API error:', error.message);
        throw new Error(`Failed to tailor resume: ${error.message}`);
    }
};

/**
 * Test Claude API connection
 */
export const testClaudeConnection = async () => {
    try {
        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 100,
            messages: [
                {
                    role: 'user',
                    content: 'Say "Hello" in one word.',
                },
            ],
        });
        console.log('✅ Claude API connection successful');
        return true;
    } catch (error) {
        console.error('❌ Claude API connection failed:', error.message);
        return false;
    }
};
