import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { getATSAnalysisPrompt } from '../prompts/atsAnalysisPrompt.js';

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
 * Convert Gemini's custom response format to our consolidated ATS format
 */
const convertGeminiFormatToATS = (geminiResponse) => {
    console.log('🔄 Converting Gemini format to ATS format...');
    console.log('🔄 Input keys:', Object.keys(geminiResponse));
    
    // Handle new Gemini format: applicant_name, overall_fit_score, experience_match, skill_match, etc.
    if (geminiResponse.applicant_name || geminiResponse.overall_fit_score) {
        console.log('🔄 Converting new Gemini format (with applicant_name, overall_fit_score)...');
        
        const overallScore = geminiResponse.overall_fit_score || 0;
        const experienceMatch = geminiResponse.experience_match || '';
        const skillMatch = geminiResponse.skill_match || '';
        
        return {
            overview: `${experienceMatch} ${skillMatch}`.trim() || `The candidate is a strong match for the role with an overall fit score of ${overallScore}%.`,
            
            score_breakdown: {
                keyword_match: Math.round(overallScore * 0.25),
                experience_match: Math.round(overallScore * 0.35),
                formatting: 75,
                impact: Math.round(overallScore * 0.25),
                overall: overallScore,
            },
            
            primary_keywords: Array.isArray(geminiResponse.primary_keywords) ? geminiResponse.primary_keywords.slice(0, 10) : [],
            secondary_keywords: Array.isArray(geminiResponse.secondary_keywords) ? geminiResponse.secondary_keywords.slice(0, 10) : [],
            
            missing_skills: Array.isArray(geminiResponse.missing_skills) ? geminiResponse.missing_skills.slice(0, 10) : [],
            matching_skills: Array.isArray(geminiResponse.matching_skills) ? geminiResponse.matching_skills.slice(0, 10) : [],
            
            role_focus: geminiResponse.achievement_analysis || 'Frontend Development',
            seniority_level: 'mid',
            
            experience_gaps: [],
            
            section_analysis: [
                {
                    section: 'Overall',
                    feedback: geminiResponse.readability_and_formatting || 'Resume formatting is good.'
                }
            ],
            
            improvement_suggestions: Array.isArray(geminiResponse.improvement_suggestions) 
                ? geminiResponse.improvement_suggestions.map(s => ({
                    section: s.section || 'Experience',
                    original: s.original || '',
                    improved: s.improved || '',
                    reason: s.reason || 'Improves ATS matching',
                }))
                : [],
            
            ats_optimization_tips: Array.isArray(geminiResponse.ats_tips) 
                ? geminiResponse.ats_tips 
                : [],
        };
    }
    
    // Handle old Gemini format: analysis, experience_calculation, skills
    const analysis = geminiResponse.analysis || {};
    const skills = geminiResponse.skills || {};
    const suggestions = geminiResponse.improvement_suggestions || [];
    
    console.log('🔄 Converting old Gemini format (with analysis, skills)...');
    
    return {
        overview: analysis.summary || `The candidate is a ${analysis.experience_match || 'moderate'} match for the role.`,
        
        score_breakdown: {
            keyword_match: Math.round((analysis.ats_score_percentage || 0) * 0.25),
            experience_match: Math.round((analysis.ats_score_percentage || 0) * 0.35),
            formatting: 75,
            impact: Math.round((analysis.ats_score_percentage || 0) * 0.25),
            overall: analysis.ats_score_percentage || 0,
        },
        
        primary_keywords: Array.isArray(skills.primary) ? skills.primary.slice(0, 10) : [],
        secondary_keywords: Array.isArray(skills.secondary) ? skills.secondary.slice(0, 10) : [],
        
        missing_skills: Array.isArray(skills.missing) ? skills.missing.slice(0, 10) : [],
        matching_skills: Array.isArray(skills.matching) ? skills.matching.slice(0, 10) : [],
        
        role_focus: analysis.job_title_match || 'Frontend Development',
        seniority_level: analysis.seniority_level || 'mid',
        
        experience_gaps: Array.isArray(geminiResponse.experience_calculation) 
            ? geminiResponse.experience_calculation.slice(0, 5) 
            : [],
        
        section_analysis: [
            {
                section: 'Overall',
                feedback: analysis.summary || 'Resume matches job requirements well.'
            }
        ],
        
        improvement_suggestions: Array.isArray(suggestions) 
            ? suggestions.map(s => ({
                section: s.section || 'Experience',
                original: s.original || '',
                improved: s.improved || '',
                reason: s.reason || 'Improves ATS matching',
            }))
            : [],
        
        ats_optimization_tips: Array.isArray(geminiResponse.ats_tips) 
            ? geminiResponse.ats_tips 
            : [],
    };
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

        const { systemPrompt, userPrompt } = getATSAnalysisPrompt(jobDescription, resumeText);

        console.log('🔍 [DEBUG] System prompt starts with:', systemPrompt.substring(0, 150));
        console.log('🔍 [DEBUG] System prompt includes "CRITICAL RULES":', systemPrompt.includes('CRITICAL RULES'));
        console.log('🔍 [DEBUG] System prompt includes "primary_keywords":', systemPrompt.includes('primary_keywords'));
        console.log('🔍 [DEBUG] User prompt starts with:', userPrompt.substring(0, 100));

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
        console.log('🔍 [DEBUG] Raw Gemini result object:', JSON.stringify(result, null, 2).substring(0, 300));
        console.log('🔍 [DEBUG] Result type:', typeof result);
        console.log('🔍 [DEBUG] Result keys:', Object.keys(result));
        console.log('🔍 [DEBUG] Result.text type:', typeof result.text);
        console.log('🔍 [DEBUG] Result.candidates:', result.candidates ? 'exists' : 'missing');
        
        // Handle the new SDK response format
        let text;
        if (typeof result.text === 'function') {
            console.log('📝 [DEBUG] Extracting text via function call');
            text = result.text();
        } else if (result.text) {
            console.log('📝 [DEBUG] Extracting text directly from result.text');
            text = result.text;
        } else if (result.candidates && result.candidates[0]) {
            console.log('📝 [DEBUG] Extracting text from result.candidates[0]');
            text = result.candidates[0].content.parts[0].text;
        } else {
            console.error('❌ [DEBUG] Unable to extract text. Result structure:', JSON.stringify(result, null, 2).substring(0, 500));
            throw new Error('Unable to extract text from Gemini response');
        }

        console.log('📝 [DEBUG] Extracted text length:', text.length);
        console.log('📝 [DEBUG] Extracted text (first 300 chars):', text.substring(0, 300));

        // Parse JSON response with multiple fallback strategies
        let analysis;
        try {
            console.log('🔍 [DEBUG] Starting JSON parsing...');
            
            // Strategy 1: Remove markdown code blocks
            let cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            console.log('🔍 [DEBUG] After removing markdown (first 200 chars):', cleanedText.substring(0, 200));
            
            // Strategy 2: Extract JSON from text if wrapped in other content
            if (!cleanedText.startsWith('{')) {
                console.log('⚠️ [DEBUG] Text does not start with {, attempting to extract JSON...');
                const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    console.log('✅ [DEBUG] Found JSON match');
                    cleanedText = jsonMatch[0];
                } else {
                    console.error('❌ [DEBUG] No JSON match found in text');
                }
            } else {
                console.log('✅ [DEBUG] Text starts with {');
            }
            
            console.log('🔍 [DEBUG] Cleaned text (first 200 chars):', cleanedText.substring(0, 200));
            console.log('🔍 [DEBUG] Cleaned text starts with {:', cleanedText.startsWith('{'));
            console.log('🔍 [DEBUG] Cleaned text ends with }:', cleanedText.endsWith('}'));
            
            // Strategy 3: Fix common JSON issues (unescaped newlines)
            cleanedText = cleanedText.replace(/\n(?=(?:[^"]*"[^"]*")*[^"]*$)/g, ' ');
            
            // Strategy 4: Parse the JSON
            if (cleanedText.startsWith('{') && cleanedText.endsWith('}')) {
                console.log('🔍 [DEBUG] Attempting JSON.parse...');
                analysis = JSON.parse(cleanedText);
                console.log('✅ [DEBUG] JSON parsed successfully');
            } else {
                console.error('❌ [DEBUG] Text does not have valid JSON boundaries');
                throw new Error('Response is not valid JSON object');
            }
        } catch (parseError) {
            console.error('❌ JSON parse error:', parseError.message);
            console.error('❌ Raw response:', text.substring(0, 500));
            
            // Try alternative: extract just the valid JSON part
            console.log('🔄 [DEBUG] Attempting to extract valid JSON portion...');
            try {
                const jsonStart = text.indexOf('{');
                const jsonEnd = text.lastIndexOf('}');
                if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                    const jsonPortion = text.substring(jsonStart, jsonEnd + 1);
                    analysis = JSON.parse(jsonPortion);
                    console.log('✅ [DEBUG] Successfully parsed JSON portion');
                } else {
                    throw new Error('Could not find valid JSON boundaries');
                }
            } catch (fallbackError) {
                console.error('❌ Fallback JSON extraction failed:', fallbackError.message);
                throw new Error('Failed to parse Gemini response as JSON');
            }
        }

        // Validate response structure - check for new ATS analysis format
        console.log('🔍 [DEBUG] Parsed analysis object keys:', Object.keys(analysis));
        console.log('🔍 [DEBUG] Full analysis:', JSON.stringify(analysis, null, 2).substring(0, 800));
        
        // Check if response has the expected consolidated format keys
        const hasExpectedFormat = analysis.primary_keywords && analysis.overview && analysis.score_breakdown;
        
        if (!hasExpectedFormat) {
            console.warn('⚠️ Gemini did not return expected consolidated format. Attempting conversion...');
            console.log('🔍 [DEBUG] Original Gemini response structure:', Object.keys(analysis));
            
            // Try to convert Gemini's custom format to our expected format
            if (analysis.applicant_name || analysis.overall_fit_score || analysis.experience_match || analysis.skill_match || analysis.achievement_analysis) {
                console.log('🔄 Converting new Gemini format (applicant_name, overall_fit_score)...');
                analysis = convertGeminiFormatToATS(analysis);
            } else if (analysis.analysis || analysis.experience_calculation || analysis.skills) {
                console.log('🔄 Converting old Gemini format (analysis, skills)...');
                analysis = convertGeminiFormatToATS(analysis);
            } else {
                console.error('❌ Unable to identify Gemini response format. Received keys:', Object.keys(analysis));
                throw new Error('Invalid analysis structure from Gemini - unrecognized response format.');
            }
            
            console.log('✅ Converted to ATS format. New keys:', Object.keys(analysis));
        } else {
            console.log('✅ Gemini returned expected consolidated format');
        }
        
        // Final validation
        if (!analysis.primary_keywords || !analysis.overview || !analysis.score_breakdown) {
            console.error('❌ After conversion, still missing required fields. Keys:', Object.keys(analysis));
            console.error('❌ Expected: primary_keywords, overview, score_breakdown, etc.');
            throw new Error('Invalid analysis structure from Gemini - missing required fields after conversion.');
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
