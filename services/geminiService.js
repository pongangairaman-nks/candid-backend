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

        // Parse JSON response
        let analysis;
        try {
            // Remove markdown code blocks if present
            const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            analysis = JSON.parse(cleanedText);
        } catch (parseError) {
            console.error('JSON parse error:', parseError.message);
            console.error('Raw response:', text);
            throw new Error('Failed to parse Gemini response as JSON');
        }

        // Validate response structure
        if (!analysis.keywords || !analysis.missing_skills || !analysis.role_focus) {
            throw new Error('Invalid analysis structure from Gemini');
        }

        console.log('✅ Gemini analysis complete');
        console.log(`  Keywords: ${analysis.keywords.length}`);
        console.log(`  Missing skills: ${analysis.missing_skills.length}`);
        console.log(`  Role focus: ${analysis.role_focus.substring(0, 50)}...`);

        return analysis;

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
