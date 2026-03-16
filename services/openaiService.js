import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Optimize a selected section of the resume using OpenAI
 */
export const optimizeSectionWithOpenAI = async (
    selectedText,
    fullLatexCode,
    jobDescription,
    prompt,
    userConfig
) => {
    if (!userConfig || !userConfig.apiKey) {
        throw new Error('OpenAI API key not configured. Please configure your LLM settings in the Configuration page.');
    }

    const client = new OpenAI({
        apiKey: userConfig.apiKey,
    });

    const systemPrompt = `You are a professional resume optimization expert. Your task is to optimize a selected section of a resume to better match a job description.

IMPORTANT RULES:
1. Optimize ONLY the selected text provided
2. Preserve LaTeX syntax and commands
3. Keep the same structure and formatting
4. Make the content more relevant to the job description
5. Return ONLY the optimized text, nothing else

Job Description Context:
${jobDescription}

Full Resume Context (for reference):
${fullLatexCode}`;

    const userMessage = `${prompt}

Selected text to optimize:
${selectedText}

Please optimize this section to better match the job description while preserving all LaTeX formatting.`;

    try {
        const message = await client.messages.create({
            model: userConfig.model || 'gpt-4o-mini',
            max_tokens: 2048,
            system: systemPrompt,
            messages: [
                {
                    role: 'user',
                    content: userMessage,
                },
            ],
        });

        const optimizedText = message.content[0].type === 'text' ? message.content[0].text : '';

        if (!optimizedText) {
            throw new Error('No response from OpenAI API');
        }

        return optimizedText;
    } catch (error) {
        console.error('❌ OpenAI section optimization error:', error);
        throw new Error(`Failed to optimize section with OpenAI: ${error.message}`);
    }
};

/**
 * Tailor resume using OpenAI
 */
export const tailorWithOpenAI = async (originalLatex, analysis, masterResumeText, jobDescription, userConfig = null) => {
    if (!userConfig || !userConfig.apiKey) {
        throw new Error('OpenAI API key not configured. Please configure your LLM settings in the Configuration page.');
    }

    const client = new OpenAI({
        apiKey: userConfig.apiKey,
    });

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
${analysis.role_focus || 'General alignment with job requirements'}

KEY KEYWORDS TO EMPHASIZE:
${(analysis.primary_keywords || analysis.keywords || []).join(', ') || 'Key skills from job description'}

SKILLS TO INCORPORATE (if relevant to candidate's background):
${(analysis.missing_skills || []).join(', ') || 'Additional relevant skills'}

MASTER RESUME CONTENT (for reference):
${masterResumeText}

${userConfig?.master_content ? `COMPREHENSIVE SKILLS & EXPERIENCE REPOSITORY (additional reference material):
${userConfig.master_content}

` : ''}ORIGINAL LaTeX TEMPLATE:
${originalLatex}

INSTRUCTIONS:
1. Update job descriptions, achievements, and skills to emphasize the keywords: ${(analysis.primary_keywords || analysis.keywords || []).slice(0, 5).join(', ') || 'key skills'}
2. Reword bullet points to align with the role focus: "${analysis.role_focus || 'job requirements'}"
3. If the candidate has experience with any of these missing skills, highlight them: ${(analysis.missing_skills || []).slice(0, 3).join(', ') || 'relevant skills'}
4. Make the content more relevant to this specific job
5. Keep all changes subtle and professional
6. DO NOT change the LaTeX structure, commands, or formatting
7. DO NOT add or remove sections

Return ONLY the updated LaTeX document. No explanations, no markdown, no code blocks - just the raw LaTeX content.`;

    try {
        const message = await client.messages.create({
            model: userConfig.model || 'gpt-4o-mini',
            max_tokens: 4096,
            system: systemPrompt,
            messages: [
                {
                    role: 'user',
                    content: userPrompt,
                },
            ],
        });

        const tailoredLatex = message.content[0].type === 'text' ? message.content[0].text : '';

        if (!tailoredLatex) {
            throw new Error('No response from OpenAI API');
        }

        return tailoredLatex;
    } catch (error) {
        console.error('❌ OpenAI resume tailoring error:', error);
        throw new Error(`Failed to tailor resume with OpenAI: ${error.message}`);
    }
};
