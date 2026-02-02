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

        const prompt = getGeminiAnalysisPrompt(jobDescription, resumeText);


        const result = await generateContent({
            model: model,
            contents: prompt
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
        if (!analysis.primary_keywords || !analysis.missing_skills || !analysis.role_focus) {
            console.error('Invalid structure. Received keys:', Object.keys(analysis));
            console.error('Full response:', JSON.stringify(analysis, null, 2));
            throw new Error('Invalid analysis structure from Gemini');
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

        console.log('✅ Gemini analysis complete');
        console.log(`  Primary keywords: ${sanitizedAnalysis.primary_keywords.length}`);
        console.log(`  Secondary keywords: ${sanitizedAnalysis.secondary_keywords.length}`);
        console.log(`  Missing skills: ${sanitizedAnalysis.missing_skills.length}`);
        console.log(`  Role focus: ${sanitizedAnalysis.role_focus.substring(0, 50)}...`);

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
