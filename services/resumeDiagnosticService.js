/**
 * Resume Diagnostic Service
 * 
 * Analyzes the gap between resume and job description
 * Provides actionable recommendations instead of blind optimization
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

/**
 * Perform comprehensive diagnostic analysis
 * 
 * @param {string} jobDescription - Raw job description
 * @param {Object} resumeContentJson - Resume content
 * @param {Object} userConfig - User's LLM config { apiKey, model, provider }
 * @returns {Promise<Object>} - Diagnostic report with gaps and recommendations
 */
async function performDiagnosticAnalysis(jobDescription, resumeContentJson, userConfig) {
  if (!jobDescription || jobDescription.trim().length === 0) {
    throw new Error('Job description cannot be empty');
  }

  if (!resumeContentJson) {
    throw new Error('Resume content JSON is required');
  }

  if (!userConfig || !userConfig.apiKey) {
    throw new Error('User LLM config is required');
  }

  const provider = userConfig.provider || 'claude';
  const model = userConfig.model || (provider === 'openai' ? 'gpt-4o-mini' : 'claude-opus-4-1-20250805');

  const systemPrompt = `You are an expert resume strategist and career coach. Your task is to perform a DIAGNOSTIC analysis of a resume against a job description.

IMPORTANT: This is NOT about optimizing for ATS score. This is about identifying REAL GAPS and providing HONEST feedback.

Analyze and return a JSON with:
1. **Current Score**: 0-100 (realistic ATS score)
2. **Achievable Score**: What's the maximum realistic score without adding new experience?
3. **Score Gap**: Difference between achievable and current
4. **Critical Gaps**: Hard requirements missing (skills/experience user doesn't have)
5. **Optimization Opportunities**: Content that can be reworded/restructured
6. **Content Gaps**: Experience user might have but didn't mention
7. **Honest Assessment**: Is this resume fixable? Or does user need more experience?
8. **Recommendations**: Specific, actionable steps

Return ONLY valid JSON with this exact structure:
{
  "current_ats_score": <number 0-100>,
  "achievable_score_without_new_experience": <number 0-100>,
  "score_gap": <number>,
  "critical_gaps": [
    {
      "gap": "<missing skill/experience>",
      "required_in_jd": true,
      "present_in_resume": false,
      "fixable": false,
      "reason": "<why this can't be fixed>"
    }
  ],
  "optimization_opportunities": [
    {
      "section": "<section name>",
      "current_content": "<brief excerpt>",
      "issue": "<what's wrong>",
      "suggestion": "<how to fix>",
      "impact_on_score": <1-5>
    }
  ],
  "content_gaps": [
    {
      "gap": "<experience/skill>",
      "likely_present": "<user probably has this>",
      "not_mentioned": true,
      "suggestion": "<how to add it>"
    }
  ],
  "honest_assessment": {
    "is_resume_fixable": <boolean>,
    "reason": "<explanation>",
    "effort_required": "low|medium|high",
    "realistic_outcome": "<what can be achieved>"
  },
  "recommendations": [
    {
      "priority": "critical|high|medium|low",
      "action": "<specific action>",
      "expected_score_impact": <1-10>,
      "effort": "low|medium|high"
    }
  ]
}`;

  const userPrompt = `Perform a diagnostic analysis of this resume against the job description.

JOB DESCRIPTION:
${jobDescription}

RESUME CONTENT (JSON):
${JSON.stringify(resumeContentJson, null, 2)}

Provide an HONEST diagnostic report. Don't sugarcoat. If the resume can't reach 85+ without new experience, say so.
Return ONLY the JSON object, no markdown, no explanations.`;

  try {
    console.log(`📋 Performing diagnostic analysis (Provider: ${provider}, Model: ${model})...`);

    let responseText = '';

    if (provider === 'openai') {
      const openaiClient = new OpenAI({ apiKey: userConfig.apiKey });
      const response = await openaiClient.chat.completions.create({
        model,
        max_tokens: 4000,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });
      responseText = response.choices[0].message.content || '';
    } else {
      const anthropicClient = new Anthropic({ apiKey: userConfig.apiKey });
      const response = await anthropicClient.messages.create({
        model,
        max_tokens: 4000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });
      responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    }

    if (!responseText) {
      throw new Error(`Empty response from ${provider}`);
    }

    // Parse JSON response
    let cleanedResponse = responseText.trim();
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```(?:json)?\s*\n?/, '');
      cleanedResponse = cleanedResponse.replace(/\n?```\s*$/, '');
    }

    let diagnostic;
    try {
      diagnostic = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error(`❌ Failed to parse diagnostic response as JSON`);
      throw new Error(`Invalid JSON response: ${parseError.message}`);
    }

    console.log(`✅ Diagnostic analysis complete`);
    console.log(`   Current Score: ${diagnostic.current_ats_score}/100`);
    console.log(`   Achievable Score: ${diagnostic.achievable_score_without_new_experience}/100`);
    console.log(`   Gap: ${diagnostic.score_gap} points`);
    console.log(`   Fixable: ${diagnostic.honest_assessment.is_resume_fixable ? 'Yes' : 'No'}`);

    return diagnostic;
  } catch (error) {
    console.error('❌ Diagnostic analysis error:', error.message);
    throw error;
  }
}

export { performDiagnosticAnalysis };
