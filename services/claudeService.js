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
${analysis.role_focus || 'General alignment with job requirements'}

KEY KEYWORDS TO EMPHASIZE:
${(analysis.primary_keywords || analysis.keywords || []).join(', ') || 'Key skills from job description'}

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
 * Analyze job description using Claude
 * @param {string} jobDescription - The job description text
 * @param {string} resumeText - The master resume text
 * @param {Object} userConfig - User's LLM configuration (model, apiKey)
 * @returns {Promise<Object>} Analysis results with keywords, missing_skills, and role_focus
 */
export const analyzeJobDescription = async (jobDescription, resumeText, userConfig = null) => {
    try {
        if (!userConfig || !userConfig.apiKey) {
            throw new Error('Claude API key not configured. Please configure your LLM settings in the Configuration page.');
        }

        const model = userConfig.model || 'claude-3-5-sonnet-latest';
        
        // Validate model is a non-empty string (actual validation happens when API is called)
        if (!model || typeof model !== 'string') {
            throw new Error(`Invalid Claude model: ${model}`);
        }

        console.log('🔍 [DEBUG] Claude analyzeJobDescription called with config:', {
            hasApiKey: !!userConfig.apiKey,
            apiKeyLength: userConfig.apiKey?.length,
            model: model,
        });

        const client = new Anthropic({ apiKey: userConfig.apiKey });
        
        console.log('🔍 [DEBUG] Using Claude model:', model);

        const systemPrompt = `You are an expert ATS (Applicant Tracking System) analyst and resume optimization specialist. Your task is to analyze a job description and compare it with a resume to extract critical information for ATS scoring.

Return a valid JSON object with the following structure:
{
  "primary_keywords": ["keyword1", "keyword2", ...],
  "secondary_keywords": ["keyword1", "keyword2", ...],
  "missing_skills": ["skill1", "skill2", ...],
  "matching_skills": ["skill1", "skill2", ...],
  "role_focus": "Brief description of the role's primary focus",
  "seniority_level": "entry|mid|senior|lead|manager|director",
  "experience_gaps": ["gap1", "gap2", ...],
  "ats_optimization_tips": ["tip1", "tip2", ...]
}

IMPORTANT: Return ONLY valid JSON, no markdown, no code blocks, no explanations.`;

        const userPrompt = `Analyze this job description and resume to extract ATS-critical information.

JOB DESCRIPTION:
${jobDescription}

RESUME:
${resumeText}

Extract:
1. Primary keywords (must-have skills/requirements) - 5-10 items
2. Secondary keywords (nice-to-have skills) - 5-10 items
3. Missing skills (in JD but not in resume) - 5-10 items
4. Matching skills (in both JD and resume) - 5-10 items
5. Role focus (main purpose of the role in 1-2 sentences)
6. Seniority level (entry, mid, senior, lead, manager, or director)
7. Experience gaps (missing experience areas)
8. ATS optimization tips (how to improve resume for this JD)

Return ONLY valid JSON.`;

        const message = await client.messages.create({
            model: model,
            max_tokens: 2000,
            temperature: 0.3,
            system: systemPrompt,
            messages: [
                {
                    role: 'user',
                    content: userPrompt,
                },
            ],
        });

        const responseText = message.content[0].text;

        // Parse JSON response
        let analysis;
        try {
            // Remove markdown code blocks if present
            let cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            // Extract JSON if wrapped in other content
            if (!cleanedText.startsWith('{')) {
                const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    cleanedText = jsonMatch[0];
                }
            }
            
            analysis = JSON.parse(cleanedText);
        } catch (parseError) {
            console.error('JSON parse error:', parseError.message);
            console.error('Raw response:', responseText.substring(0, 500));
            throw new Error('Failed to parse Claude response as JSON');
        }

        // Validate response structure
        if (!analysis.primary_keywords || !analysis.missing_skills || !analysis.role_focus) {
            console.error('Invalid structure. Received keys:', Object.keys(analysis));
            throw new Error('Invalid analysis structure from Claude');
        }

        // Ensure all required arrays exist and are arrays
        const sanitizedAnalysis = {
            primary_keywords: Array.isArray(analysis.primary_keywords) ? analysis.primary_keywords : [],
            secondary_keywords: Array.isArray(analysis.secondary_keywords) ? analysis.secondary_keywords : [],
            missing_skills: Array.isArray(analysis.missing_skills) ? analysis.missing_skills : [],
            matching_skills: Array.isArray(analysis.matching_skills) ? analysis.matching_skills : [],
            experience_gaps: Array.isArray(analysis.experience_gaps) ? analysis.experience_gaps : [],
            role_focus: String(analysis.role_focus || ''),
            seniority_level: String(analysis.seniority_level || 'mid'),
            ats_optimization_tips: Array.isArray(analysis.ats_optimization_tips) ? analysis.ats_optimization_tips : [],
        };

        console.log('✅ Claude analysis complete');
        console.log(`  Primary keywords: ${sanitizedAnalysis.primary_keywords?.length || 0}`);
        console.log(`  Secondary keywords: ${sanitizedAnalysis.secondary_keywords?.length || 0}`);
        console.log(`  Missing skills: ${sanitizedAnalysis.missing_skills?.length || 0}`);
        console.log(`  Role focus: ${sanitizedAnalysis.role_focus?.substring(0, 50) || ''}...`);

        return sanitizedAnalysis;

    } catch (error) {
        console.error('❌ Claude API error:', error.message);
        throw new Error(`Failed to analyze job description: ${error.message}`);
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

/**
 * Optimize a selected section of the resume using Claude
 */
export const optimizeSectionWithClaude = async (
    selectedText,
    fullLatexCode,
    jobDescription,
    prompt,
    userConfig
) => {
    if (!userConfig || !userConfig.apiKey) {
        throw new Error('Claude API key not configured. Please configure your LLM settings in the Configuration page.');
    }

    const client = new Anthropic({
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
        const response = await client.messages.create({
            model: userConfig.model || 'claude-opus-4-1-20250805',
            max_tokens: 2000,
            system: systemPrompt,
            messages: [
                {
                    role: 'user',
                    content: userMessage,
                },
            ],
        });

        const optimizedText = response.content[0].type === 'text' ? response.content[0].text : '';
        return optimizedText.trim();
    } catch (error) {
        console.error('❌ Claude section optimization error:', error.message);
        throw new Error(`Failed to optimize section with Claude: ${error.message}`);
    }
};
