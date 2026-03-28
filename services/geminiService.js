import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { getGeminiAnalysisPrompt } from '../prompts/geminiAnalysisPrompt.js';

dotenv.config();

// Get Gemini model with user's API key
const getModel = (apiKey) => {
    if (!apiKey) {
        throw new Error('Gemini API key not configured. Please configure your LLM settings in the Configuration page.');
    }
    const ai = new GoogleGenAI({ apiKey });
    return ai.models.generateContent;
};

/**
 * Analyze job description and extract keywords, missing skills, and role focus
 * @param {string} jobDescription - The job description text
 * @param {string} resumeText - The master resume text
 * @param {Object} userConfig - User's LLM configuration (model, apiKey)
 * @returns {Promise<Object>} Analysis results with keywords, missing_skills, and role_focus
 */
export const analyzeJobDescription = async (jobDescription, resumeText, userConfig = null) => {
    try {
        // Require user config with API key
        if (!userConfig || !userConfig.apiKey) {
            throw new Error('Gemini API key not configured. Please configure your LLM settings in the Configuration page.');
        }

        const generateContent = getModel(userConfig.apiKey);
        const model = userConfig.model || 'gemini-2.5-flash';

        const { systemPrompt, userPrompt } = getGeminiAnalysisPrompt(jobDescription, resumeText);

        const result = await generateContent({
        model: model,
        systemInstruction: {
            role: "system",
            parts: [{ text: systemPrompt }],
        },
        contents: [
            {
            role: "user",
            parts: [{ text: userPrompt }],
            },
        ],
        });
        
        // Handle the new SDK response format
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

        // Parse JSON response with multiple fallback strategies
        let analysis;
        try {
            // Strategy 1: Remove markdown code blocks
            let cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            // Strategy 2: Extract JSON from text if wrapped in other content
            if (!cleanedText.startsWith('{')) {
                const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    cleanedText = jsonMatch[0];
                }
            }
            
            // Strategy 3: Parse the JSON
            if (cleanedText.startsWith('{') && cleanedText.endsWith('}')) {
                analysis = JSON.parse(cleanedText);
            } else {
                throw new Error('Response is not valid JSON object');
            }
        } catch (parseError) {
            console.error('JSON parse error:', parseError.message);
            console.error('Raw response:', text.substring(0, 500));
            throw new Error('Failed to parse Gemini response as JSON');
        }

        // Validate response structure - check for new ATS analysis format
        if (!analysis.primary_keywords || !analysis.overview) {
            console.error('Invalid structure. Received keys:', Object.keys(analysis));
            throw new Error('Invalid analysis structure from Gemini');
          }
        // Ensure all required arrays exist and are arrays
        const sanitizedAnalysis = {
            overview: String(analysis.overview || ''),
          
            score_breakdown: {
              keyword_match: Number(analysis?.score_breakdown?.keyword_match || 0),
              experience_match: Number(analysis?.score_breakdown?.experience_match || 0),
              formatting: Number(analysis?.score_breakdown?.formatting || 0),
              impact: Number(analysis?.score_breakdown?.impact || 0),
              overall: Number(analysis?.score_breakdown?.overall || 0),
            },
          
            primary_keywords: Array.isArray(analysis.primary_keywords) ? analysis.primary_keywords : [],
            secondary_keywords: Array.isArray(analysis.secondary_keywords) ? analysis.secondary_keywords : [],
          
            missing_skills: Array.isArray(analysis.missing_skills) ? analysis.missing_skills : [],
            matching_skills: Array.isArray(analysis.matching_skills) ? analysis.matching_skills : [],
          
            role_focus: String(analysis.role_focus || ''),
            seniority_level: String(analysis.seniority_level || 'mid'),
          
            experience_gaps: Array.isArray(analysis.experience_gaps) ? analysis.experience_gaps : [],
          
            section_analysis: Array.isArray(analysis.section_analysis)
              ? analysis.section_analysis
              : [],
          
            improvement_suggestions: Array.isArray(analysis.improvement_suggestions)
              ? analysis.improvement_suggestions
              : [],
          
            ats_optimization_tips: Array.isArray(analysis.ats_optimization_tips)
              ? analysis.ats_optimization_tips
              : [],
        };

        console.log('✅ Gemini analysis complete');
        console.log(`  Primary keywords: ${sanitizedAnalysis.primary_keywords?.length || 0}`);
        console.log(`  Secondary keywords: ${sanitizedAnalysis.secondary_keywords?.length || 0}`);
        console.log(`  Missing skills: ${sanitizedAnalysis.missing_skills?.length || 0}`);
        console.log(`  Role focus: ${sanitizedAnalysis.role_focus?.substring(0, 50) || ''}...`);

        return sanitizedAnalysis;

    } catch (error) {
        console.error('❌ Gemini API error:', error.message);
        throw new Error(`Failed to analyze job description: ${error.message}`);
    }
};

/**
 * Test Gemini API connection
 */
export const testGeminiConnection = async () => {
    try {
        const generateContent = getModel();
        const result = await generateContent({
            model: 'gemini-2.5-flash',
            contents: 'Say "Hello" in JSON format: {"message": "Hello"}'
        });
        console.log('✅ Gemini API connection successful');
        return true;
    } catch (error) {
        console.error('❌ Gemini API connection failed:', error.message);
        return false;
    }
};

/**
 * Optimize a selected section of the resume using Gemini
 */
export const optimizeSectionWithGemini = async (
    selectedText,
    fullLatexCode,
    jobDescription,
    prompt,
    userConfig
) => {
    if (!userConfig || !userConfig.apiKey) {
        throw new Error('Gemini API key not configured. Please configure your LLM settings in the Configuration page.');
    }

    const generateContent = getModel(userConfig.apiKey);
    const model = userConfig.model || 'gemini-2.5-flash';

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
        const result = await generateContent({
            model: model,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: systemPrompt },
                        { text: userMessage }
                    ]
                }
            ]
        });

        let optimizedText;
        if (typeof result.text === 'function') {
            optimizedText = result.text();
        } else if (result.text) {
            optimizedText = result.text;
        } else if (result.candidates && result.candidates[0]) {
            optimizedText = result.candidates[0].content.parts[0].text;
        } else {
            throw new Error('Unable to extract text from Gemini response');
        }

        return optimizedText.trim();
    } catch (error) {
        console.error('❌ Gemini section optimization error:', error.message);
        throw new Error(`Failed to optimize section with Gemini: ${error.message}`);
    }
};

/**
 * Tailor resume using Gemini
 */
export const tailorWithGemini = async (originalLatex, analysis, masterResumeText, jobDescription, userConfig = null) => {
    if (!userConfig || !userConfig.apiKey) {
        throw new Error('Gemini API key not configured. Please configure your LLM settings in the Configuration page.');
    }

    const generateContent = getModel(userConfig.apiKey);
    const model = userConfig.model || 'gemini-2.5-flash';

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
        const result = await generateContent({
            model: model,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: systemPrompt },
                        { text: userPrompt }
                    ]
                }
            ]
        });

        let tailoredLatex;
        if (typeof result.text === 'function') {
            tailoredLatex = result.text();
        } else if (result.text) {
            tailoredLatex = result.text;
        } else if (result.candidates && result.candidates[0]) {
            tailoredLatex = result.candidates[0].content.parts[0].text;
        } else {
            throw new Error('Unable to extract text from Gemini response');
        }

        if (!tailoredLatex) {
            throw new Error('No response from Gemini API');
        }

        return tailoredLatex;
    } catch (error) {
        console.error('❌ Gemini resume tailoring error:', error.message);
        throw new Error(`Failed to tailor resume with Gemini: ${error.message}`);
    }
};
