import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

const callAnthropic = async (apiKey, model, system, messages, maxTokens = 1000) => {
  const client = new Anthropic({ apiKey });
  const resp = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages,
    system,
  });
  const text = resp?.content?.[0]?.text || '';
  return { text, usage: resp?.usage };
};

const callOpenAI = async (apiKey, model, system, messages, maxTokens = 1000) => {
  const client = new OpenAI({ apiKey });
  const resp = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      ...messages,
    ],
  });
  const text = resp?.choices?.[0]?.message?.content || '';
  return { text, usage: resp?.usage };
};

const callGemini = async (apiKey, model, system, messages) => {
  const ai = new GoogleGenAI({ apiKey });
  const generateContent = ai.models.generateContent;
  
  const formattedMessages = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));

  const prompt = `${system}\n\nConversation:\n${messages.map(m => `${m.role}: ${m.content}`).join('\n')}`;
  
  const result = await generateContent({ model, contents: prompt });
  let text;
  if (typeof result.text === 'function') text = result.text();
  else if (result.text) text = result.text;
  else if (result.candidates && result.candidates[0]) text = result.candidates[0].content.parts[0].text;
  else text = '';
  return { text };
};

const callLLM = async ({ provider, model, apiKey, system, messages, maxTokens }) => {
  if (provider === 'claude') return callAnthropic(apiKey, model, system, messages, maxTokens);
  if (provider === 'openai') return callOpenAI(apiKey, model, system, messages, maxTokens);
  if (provider === 'gemini') return callGemini(apiKey, model, system, messages);
  throw new Error(`Unsupported provider: ${provider}`);
};

const parseJsonResponse = (text) => {
  if (!text) throw new Error('Empty LLM response');
  
  try {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // If no JSON found, create a structured response
    return {
      refined_content: text,
      refinement_suggestion: 'Content has been refined based on your request.',
    };
  } catch (error) {
    // If JSON parsing fails, return the text as-is
    return {
      refined_content: text,
      refinement_suggestion: 'Content has been refined based on your request.',
    };
  }
};

/**
 * Refine a resume section using LLM with multi-turn conversation
 * 
 * @param {Object} params
 * @param {string} params.provider - LLM provider (claude, openai, gemini)
 * @param {string} params.model - Model name
 * @param {string} params.apiKey - API key
 * @param {string} params.section_key - Section identifier
 * @param {string} params.section_title - Section title (e.g., "Professional Experience")
 * @param {string} params.section_content - Current section content
 * @param {string} params.job_description - Job description for context
 * @param {Array} params.conversation_history - Previous messages in conversation
 * @param {string} params.user_message - Current user refinement request
 * 
 * @returns {Promise<Object>} { refined_content, refinement_suggestion, tokens_used }
 */
export const tailorSectionWithLLM = async ({
  provider,
  model,
  apiKey,
  section_key,
  section_title,
  section_content,
  job_description,
  conversation_history = [],
  user_message,
}) => {
  if (process.env.LLM_STUB === 'true') {
    return {
      refined_content: `${section_content}\n\n[Refined based on: ${user_message}]`,
      refinement_suggestion: `I've updated the ${section_title} section to better align with your request: "${user_message}". The content now emphasizes relevant keywords and experiences.`,
      tokens_used: 500,
    };
  }

  const systemPrompt = `You are an expert resume editor specializing in tailoring resume sections for specific job applications.

Your task is to refine the given resume section based on the user's requests while maintaining professional quality and authenticity.

IMPORTANT RULES:
1. Only modify the content, not the structure or formatting
2. Keep the refined content concise and impactful
3. Use action verbs and quantifiable metrics where possible
4. Maintain the original tone and professionalism
5. Ensure changes are relevant to the job description provided
6. Return ONLY the refined section content, no explanations or markdown

CONTEXT:
- Section Title: ${section_title}
- Section Key: ${section_key}
- Job Description: ${job_description}

Current Section Content:
${section_content}`;

  // Build conversation messages
  const messages = [
    ...conversation_history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    {
      role: 'user',
      content: user_message,
    },
  ];

  try {
    const result = await callLLM({
      provider,
      model,
      apiKey,
      system: systemPrompt,
      messages,
      maxTokens: 1000,
    });

    const parsed = parseJsonResponse(result.text);

    return {
      refined_content: parsed.refined_content || result.text,
      refinement_suggestion: parsed.refinement_suggestion || `I've refined the ${section_title} section based on your request.`,
      tokens_used: result.usage?.input_tokens || 0,
    };
  } catch (error) {
    console.error('❌ Section refinement LLM error:', error.message);
    throw new Error(`Failed to refine section: ${error.message}`);
  }
};

/**
 * Generate a refinement suggestion without modifying content
 * Used for previewing changes before applying
 */
export const generateRefinementSuggestion = async ({
  provider,
  model,
  apiKey,
  section_title,
  section_content,
  job_description,
  user_message,
}) => {
  if (process.env.LLM_STUB === 'true') {
    return {
      suggestion: `I can refine the ${section_title} section to better match the job requirements. The changes will emphasize relevant skills and experiences.`,
      preview: `${section_content}\n\n[Preview of changes based on: ${user_message}]`,
    };
  }

  const systemPrompt = `You are an expert resume editor. Provide a brief suggestion for how to refine the given resume section.

Return a JSON object with:
{
  "suggestion": "Brief explanation of proposed changes",
  "preview": "Preview of the refined content"
}`;

  const messages = [
    {
      role: 'user',
      content: `Section: ${section_title}\nCurrent content: ${section_content}\nJob description: ${job_description}\nRefinement request: ${user_message}`,
    },
  ];

  try {
    const result = await callLLM({
      provider,
      model,
      apiKey,
      system: systemPrompt,
      messages,
      maxTokens: 800,
    });

    const parsed = parseJsonResponse(result.text);
    return parsed;
  } catch (error) {
    console.error('❌ Refinement suggestion error:', error.message);
    throw new Error(`Failed to generate suggestion: ${error.message}`);
  }
};
