import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Generate tailored resume using Claude (with Gemini fallback) while preserving LaTeX template structure
 * @param {string} originalLatex - The original LaTeX template
 * @param {Object} analysis - Gemini analysis results (keywords, missing_skills, role_focus)
 * @param {string} masterResumeText - Master resume text content
 * @param {string} jobDescription - Job description text
 * @param {Object} userConfig - User's LLM configuration (model, apiKey)
 * @returns {Promise<string>} Tailored LaTeX content
 */
export const tailorResumeContent = async (
    originalLatex,
    analysis,
    masterResumeText,
    jobDescription,
    userConfig = null
) => {
    try {
        // Try Claude first
        console.log('🤖 Attempting to call Claude API for resume tailoring...');
        return await tailorWithClaude(originalLatex, analysis, masterResumeText, jobDescription, userConfig);
    } catch (claudeError) {
        console.warn('⚠️  Claude API failed, falling back to Gemini:', claudeError.message);
        try {
            // For fallback, we need to get the analyzer config which has Gemini API key
            const analyzerConfig = {
                provider: userConfig?.analyzer_provider || 'gemini',
                model: userConfig?.analyzer_model || 'gemini-2.5-flash',
                apiKey: userConfig?.analyzer_api_key
            };
            return await tailorWithGemini(originalLatex, analysis, masterResumeText, jobDescription, analyzerConfig);
        } catch (geminiError) {
            console.error('❌ Both Claude and Gemini failed');
            throw new Error(`Failed to tailor resume: Claude - ${claudeError.message}, Gemini - ${geminiError.message}`);
        }
    }
};

/**
 * Tailor resume using Claude
 */
const tailorWithClaude = async (originalLatex, analysis, masterResumeText, jobDescription, userConfig = null) => {
    // Require user config with API key
    if (!userConfig || !userConfig.apiKey) {
        throw new Error('Claude API key not configured. Please configure your LLM settings in the Configuration page.');
    }

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

${userConfig?.master_content ? `COMPREHENSIVE SKILLS & EXPERIENCE REPOSITORY (additional reference material):
${userConfig.master_content}

` : ''}ORIGINAL LaTeX TEMPLATE:
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

    const model = userConfig.model || 'claude-opus-4-1-20250805';
    const client = new Anthropic({ apiKey: userConfig.apiKey });

    const message = await client.messages.create({
        model: model,
        max_tokens: 8000,
        temperature: 0.3,
        system: systemPrompt,
        messages: [
            {
                role: 'user',
                content: userPrompt,
            },
        ],
    });

    const tailoredLatex = message.content[0].text;

    if (!tailoredLatex.includes('\\documentclass') && !tailoredLatex.includes('\\begin{document}')) {
        console.warn('⚠️  Warning: Response may not be valid LaTeX');
        const latexMatch = tailoredLatex.match(/```(?:latex)?\n?([\s\S]*?)\n?```/);
        if (latexMatch) {
            console.log('📝 Extracted LaTeX from code block');
            return latexMatch[1];
        }
    }

    console.log(`✅ Claude (${model}) tailoring complete`);
    return tailoredLatex;
};

/**
 * Tailor resume using Gemini (fallback)
 */
const tailorWithGemini = async (originalLatex, analysis, masterResumeText, jobDescription, analyzerConfig = null) => {
    console.log('🤖 Using Gemini for resume tailoring...');
    
    if (!analyzerConfig || !analyzerConfig.apiKey) {
        throw new Error('Gemini API key not available for fallback');
    }
    
    const ai = new GoogleGenAI({ apiKey: analyzerConfig.apiKey });
    const generateContent = ai.models.generateContent;
    const model = analyzerConfig.model || 'gemini-2.5-flash';
    
    const prompt = `You are an expert resume content editor specializing in LaTeX documents. Your ONLY job is to update the written content inside a LaTeX resume template to better match a job description.

CRITICAL RULES:
1. You MUST preserve the ENTIRE LaTeX structure, commands, packages, and formatting
2. You MUST NOT add, remove, or modify any LaTeX commands
3. You MUST NOT change spacing, margins, or layout commands
4. You MUST NOT add or remove sections
5. You MUST ONLY update the actual text content (job titles, descriptions, skills, achievements)
6. Return ONLY the complete LaTeX document with updated content
7. Do NOT include any explanations, markdown formatting, or code blocks

JOB DESCRIPTION:
${jobDescription}

ROLE FOCUS:
${analysis.role_focus}

KEY KEYWORDS TO EMPHASIZE:
${analysis.keywords.join(', ')}

ORIGINAL LaTeX TEMPLATE:
${originalLatex}

Update the resume content to emphasize these keywords and align with the role focus. Preserve all LaTeX structure. Return ONLY the updated LaTeX document.`;

    const result = await generateContent({
        model: model,
        contents: prompt
    });

    let text;
    if (typeof result.text === 'function') {
        text = result.text();
    } else if (result.text) {
        text = result.text;
    } else if (result.candidates && result.candidates[0]) {
        text = result.candidates[0].content.parts[0].text;
    } else {
        throw new Error('Unable to extract text from Gemini response');
    }

    const cleanedText = text.replace(/```latex\n?/g, '').replace(/```\n?/g, '').trim();
    console.log('✅ Gemini tailoring complete');
    return cleanedText;
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
