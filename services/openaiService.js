import OpenAI from 'openai';
import dotenv from 'dotenv';
import { getATSAnalysisPrompt } from '../prompts/atsAnalysisPrompt.js';

dotenv.config();

const ATS_OPTIMIZATION_RULES = `Follow these directives to transform the provided LaTeX resume into an ATS-optimized version while keeping it production-ready and identical in scope:

CRITICAL CONSTRAINTS
- Strict content preservation: keep total wording within +/-5% of the source. Maintain the same section hierarchy, bullet counts, ordering, and approximate line usage. Do NOT merge, split, add, or remove bullets or sentences unless the original content is empty or duplicated.
- Structured content usage: reference any master profile data only to refine existing sentences—never to expand or create new sections.
- No fabrication: do NOT invent new achievements, metrics, tools, responsibilities, or experiences. Only enhance wording for what already exists.
- Safe LaTeX only: use stable commands already present (\\textbf{}, \\section{}, \\begin{itemize}...\\end{itemize}, basic spacing like \\ or \\vspace). NEVER introduce fragile primitives such as \\hbox, \\vbox, \\raise, \\lower, or \\kern, and do not add custom macros, new packages, or layout changes.
- Minimal transformation: treat this as precise optimization, not rewriting. Preserve original meaning, intent, and density in every sentence.
- One-page guarantee: the output must preserve the single-page layout. Avoid changes that expand spacing or push content beyond one page.

OBJECTIVES
- Keyword integration: weave relevant skills, tools, and phrases from the job description naturally into existing sentences without keyword stuffing or altering factual accuracy.
- Bullet articulation: strengthen bullet phrasing with clear action verbs (Built, Led, Designed, Optimized, Scaled, Delivered) while keeping each bullet within one to two lines and retaining all substantive details.
- Relevance alignment: adjust emphasis inside bullets to reflect the job description, but keep every bullet present.
- Clarity & conciseness: remove redundancy only when total content volume remains the same. Improve readability and flow without shortening the document.
- ATS compatibility: favor plain text, avoid inline math or unusual symbols, and keep formatting clean for parsing.

OUTPUT FORMAT
- Return RAW LaTeX text only—no explanations, markdown, comments, or code fences. Do NOT wrap the response in triple backticks.
- Preserve the existing document class, preamble, spacing commands, and packages exactly as provided.
- Ensure the result compiles in minimal pdflatex environments without fragile constructs.
- Maintain substantive coverage: when tightening phrasing, redistribute essential keywords so overall coverage matches the source.
- Avoid special characters that require new packages and keep leading/trailing blank lines consistent with the input.

Only rewrite existing sentences to improve clarity and ATS alignment while preserving the original content volume.`;

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

    const systemPrompt = `You are a professional resume optimization expert specializing in ATS-compliant LaTeX resumes.

${ATS_OPTIMIZATION_RULES}

Job Description Context:
${jobDescription}

Full Resume Context (for reference):
${fullLatexCode}`;

    const userMessage = `${prompt}

Selected text to optimize:
${selectedText}

Please optimize this section to better match the job description while preserving all LaTeX formatting.`;

    try {
        const message = await client.chat.completions.create({
            model: userConfig.model || 'gpt-4o-mini',
            max_tokens: 4096,
            temperature: 0.7,
            messages: [
                {
                    role: 'system',
                    content: systemPrompt,
                },
                {
                    role: 'user',
                    content: userMessage,
                },
            ],
        });

        const optimizedText = message.choices[0].message.content;

        if (!optimizedText) {
            throw new Error('No response from OpenAI API');
        }

        const trimmedText = optimizedText.trim();

        // Validate that the response contains a complete LaTeX document
        if (!trimmedText.includes('\\end{document}')) {
            console.warn('⚠️ Warning: Optimized LaTeX may be incomplete - missing \\end{document}');
            console.warn('Response length:', trimmedText.length);
            console.warn('Last 200 chars:', trimmedText.slice(-200));
            throw new Error('Incomplete LaTeX response: missing \\end{document}. The response was likely truncated. Please try again or increase max_tokens.');
        }

        return trimmedText;
    } catch (error) {
        console.error('❌ OpenAI section optimization error:', error);
        throw new Error(`Failed to optimize section with OpenAI: ${error.message}`);
    }
};

/**
 * Analyze job description using OpenAI
 * @param {string} jobDescription - The job description text
 * @param {string} resumeText - The master resume text
 * @param {Object} userConfig - User's LLM configuration (model, apiKey)
 * @returns {Promise<Object>} Analysis results with keywords, missing_skills, and role_focus
 */
export const analyzeJobDescription = async (jobDescription, resumeText, userConfig = null) => {
    try {
        if (!userConfig || !userConfig.apiKey) {
            throw new Error('OpenAI API key not configured. Please configure your LLM settings in the Configuration page.');
        }

        const client = new OpenAI({ apiKey: userConfig.apiKey });
        const model = userConfig.model || 'gpt-4o-mini';

        const { systemPrompt, userPrompt } = getATSAnalysisPrompt(jobDescription, resumeText);

        try {
            const message = await client.chat.completions.create({
                model: model,
                max_tokens: 4000,
                temperature: 0.3,
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt,
                    },
                    {
                        role: 'user',
                        content: userPrompt,
                    },
                ],
            });

            const responseText = message.choices[0].message.content;
            console.log('📝 [DEBUG] OpenAI raw response length:', responseText.length);
            console.log('📝 [DEBUG] OpenAI response (first 300 chars):', responseText.substring(0, 300));

            // Parse JSON response
            let analysis;
            try {
                console.log('🔍 [DEBUG] Starting JSON parsing...');
                
                // Remove markdown code blocks if present
                let cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                console.log('🔍 [DEBUG] After removing markdown (first 200 chars):', cleanedText.substring(0, 200));
                
                // Extract JSON if wrapped in other content
                if (!cleanedText.startsWith('{')) {
                    console.log('⚠️ [DEBUG] Text does not start with {, attempting to extract JSON...');
                    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        console.log('✅ [DEBUG] Found JSON match');
                        cleanedText = jsonMatch[0];
                    }
                }
                
                console.log('🔍 [DEBUG] Final cleaned text length:', cleanedText.length);
                console.log('🔍 [DEBUG] Final cleaned text (first 200 chars):', cleanedText.substring(0, 200));
                console.log('🔍 [DEBUG] Attempting JSON.parse...');
                
                // Try to fix common JSON issues
                // Fix unescaped newlines in strings
                cleanedText = cleanedText.replace(/\n(?=(?:[^"]*"[^"]*")*[^"]*$)/g, ' ');
                
                analysis = JSON.parse(cleanedText);
                console.log('✅ [DEBUG] JSON parsed successfully');
            } catch (parseError) {
                console.error('❌ JSON parse error:', parseError.message);
                console.error('❌ Error position:', parseError.message.match(/position (\d+)/)?.[1]);
                console.error('❌ Raw response length:', responseText.length);
                console.error('❌ Raw response (first 800 chars):', responseText.substring(0, 800));
                console.error('❌ Raw response (last 200 chars):', responseText.substring(responseText.length - 200));
                
                // Try alternative: extract just the valid JSON part
                console.log('🔄 [DEBUG] Attempting to extract valid JSON portion...');
                try {
                    const jsonStart = responseText.indexOf('{');
                    const jsonEnd = responseText.lastIndexOf('}');
                    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                        const jsonPortion = responseText.substring(jsonStart, jsonEnd + 1);
                        analysis = JSON.parse(jsonPortion);
                        console.log('✅ [DEBUG] Successfully parsed JSON portion');
                    } else {
                        throw new Error('Could not find valid JSON boundaries');
                    }
                } catch (fallbackError) {
                    console.error('❌ Fallback JSON extraction failed:', fallbackError.message);
                    throw new Error('Failed to parse OpenAI response as JSON');
                }
            }

            // Validate response structure - check for expected consolidated format
            console.log('🔍 [DEBUG] Parsed analysis object keys:', Object.keys(analysis));
            
            const hasExpectedFormat = analysis.primary_keywords && analysis.overview && analysis.score_breakdown;
            
            if (!hasExpectedFormat) {
                console.warn('⚠️ OpenAI did not return expected consolidated format. Received keys:', Object.keys(analysis));
                console.error('Invalid structure. Expected: primary_keywords, overview, score_breakdown, etc.');
                throw new Error('Invalid analysis structure from OpenAI - missing required fields');
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

            console.log('✅ OpenAI analysis complete');
            console.log(`  Primary keywords: ${sanitizedAnalysis.primary_keywords?.length || 0}`);
            console.log(`  Secondary keywords: ${sanitizedAnalysis.secondary_keywords?.length || 0}`);
            console.log(`  Missing skills: ${sanitizedAnalysis.missing_skills?.length || 0}`);
            console.log(`  Role focus: ${sanitizedAnalysis.role_focus?.substring(0, 50) || ''}...`);

            return sanitizedAnalysis;

        } catch (error) {
            console.error('❌ OpenAI API error:', error.message);
            throw new Error(`Failed to analyze job description: ${error.message}`);
        }
    } catch (error) {
        console.error('❌ OpenAI analysis error:', error.message);
        throw new Error(`Failed to analyze job description: ${error.message}`);
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

You are a CONTENT EDITOR, not a TEMPLATE DESIGNER.

${ATS_OPTIMIZATION_RULES}`;

    const userPrompt = `I need you to update the content of this LaTeX resume to better match the job description below.

JOB DESCRIPTION:
${jobDescription}

ROLE FOCUS:
${analysis.role_focus || 'General alignment with job requirements'}

KEY KEYWORDS TO EMPHASIZE:
${(analysis?.primary_keywords || analysis?.keywords || []).join(', ') || 'Key skills from job description'}

SKILLS TO INCORPORATE (if relevant to candidate's background):
${(analysis?.missing_skills || []).join(', ') || 'Additional relevant skills'}

MASTER RESUME CONTENT (for reference):
${masterResumeText}

${userConfig?.master_content ? `COMPREHENSIVE SKILLS & EXPERIENCE REPOSITORY (additional reference material):
${userConfig?.master_content}

` : ''}ORIGINAL LaTeX TEMPLATE:
${originalLatex}

INSTRUCTIONS:
1. Update job descriptions, achievements, and skills to emphasize the keywords: ${(analysis?.primary_keywords || analysis?.keywords || []).slice(0, 5).join(', ') || 'key skills'}
2. Reword bullet points to align with the role focus: "${analysis?.role_focus || 'job requirements'}"
3. If the candidate has experience with any of these missing skills, highlight them: ${(analysis?.missing_skills || []).slice(0, 3).join(', ') || 'relevant skills'}
4. Make the content more relevant to this specific job
5. Keep all changes subtle and professional
6. DO NOT change the LaTeX structure, commands, or formatting
7. DO NOT add or remove sections

Return ONLY the updated LaTeX document. No explanations, no markdown, no code blocks - just the raw LaTeX content.`;

    try {
        const message = await client.chat.completions.create({
            model: userConfig?.model || 'gpt-4o-mini',
            max_tokens: 4000,
            temperature: 0.7,
            messages: [
                {
                    role: 'system',
                    content: systemPrompt,
                },
                {
                    role: 'user',
                    content: userPrompt,
                },
            ],
        });

        const tailoredLatex = message.choices[0].message.content;

        if (!tailoredLatex) {
            throw new Error('No response from OpenAI API');
        }

        return tailoredLatex;
    } catch (error) {
        console.error('❌ OpenAI resume tailoring error:', error);
        throw new Error(`Failed to tailor resume with OpenAI: ${error.message}`);
    }
};
