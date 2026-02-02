import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Gemini API with new SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Get Gemini model - using gemini-2.5-flash (current free model)
const getModel = () => {
    return ai.models.generateContent;
};

/**
 * Analyze job description and extract keywords, missing skills, and role focus
 * @param {string} jobDescription - The job description text
 * @param {string} resumeText - The master resume text
 * @returns {Promise<Object>} Analysis results with keywords, missing_skills, and role_focus
 */
export const analyzeJobDescription = async (jobDescription, resumeText) => {
    try {
        const generateContent = getModel();

        const prompt = `You are an expert resume and job description analyzer. Analyze the following job description and compare it with the candidate's resume.

JOB DESCRIPTION:
${jobDescription}

CANDIDATE'S RESUME:
${resumeText}

Please provide a detailed analysis in the following JSON format (respond ONLY with valid JSON, no markdown or explanations):

{
  "keywords": ["keyword1", "keyword2", ...],
  "missing_skills": ["skill1", "skill2", ...],
  "role_focus": "brief description of the role's main focus"
}

Instructions:
1. "keywords": Extract 10-15 most important keywords, skills, and technologies from the job description that should be emphasized in the resume
2. "missing_skills": Identify 5-10 skills or qualifications mentioned in the JD that are NOT present in the candidate's resume
3. "role_focus": Provide a 1-2 sentence summary of what this role primarily focuses on (e.g., "Backend development with focus on scalable microservices and cloud infrastructure")

Respond with ONLY the JSON object, no additional text.`;

        const result = await generateContent({
            model: 'gemini-2.5-flash',
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
