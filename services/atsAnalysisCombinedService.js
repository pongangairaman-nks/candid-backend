/**
 * Combined ATS Analysis + Diagnostic Service
 * 
 * Single LLM call that returns:
 * 1. ATS Score + Analysis + Weak Sections
 * 2. Diagnostic insights + Recommendations
 * 
 * This replaces separate calls to atsAnalysisV2Service and resumeDiagnosticService
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

/**
 * Perform combined ATS analysis and diagnostic in a single LLM call
 * 
 * @param {string} jobDescription - Raw job description
 * @param {Object} resumeContentJson - Extracted resume content
 * @param {Object} userConfig - User's LLM config { apiKey, model, provider }
 * @returns {Promise<Object>} - Combined analysis with ATS score and diagnostic
 */
async function analyzeResumeWithDiagnostic(jobDescription, resumeContentJson, userConfig) {
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

  const systemPrompt = `You are an expert ATS (Applicant Tracking System) analyst, resume strategist, and career coach.

Your task is to perform a COMPREHENSIVE analysis of a resume against a job description in a SINGLE response.

Return ONLY valid JSON with this exact structure:
{
  "ats_score": <number 0-100>,
  "analysis": {
    "overall_match": "<brief description of overall fit>",
    "strengths": ["<strength 1>", "<strength 2>"],
    "weaknesses": ["<weakness 1>", "<weakness 2>"]
  },
  "weak_sections": [
    {
      "section_key": "<section_key>",
      "section_name": "<human readable name>",
      "match_percentage": <number 0-100>,
      "priority": "critical|high|medium|low",
      "reason": "<why weak>",
      "missing_keywords": ["<keyword 1>"],
      "suggestion": "<improvement>"
    }
  ],
  "missing_keywords": ["<keyword 1>", "<keyword 2>"],
  "optimization_priority": ["<section_key_1>"],
  "diagnostic": {
    "current_ats_score": <same as ats_score>,
    "achievable_score_without_new_experience": <number 0-100>,
    "score_gap": <number>,
    "critical_gaps": [
      {
        "gap": "<missing skill/experience>",
        "required_in_jd": true,
        "present_in_resume": false,
        "fixable": false,
        "reason": "<why unfixable>"
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
        "suggestion": "<how to add>"
      }
    ],
    "honest_assessment": {
      "is_resume_fixable": true,
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
  }
}

IMPORTANT RULES:
1. ATS Score (0-100) reflects how well resume matches job description
2. current_ats_score in diagnostic MUST equal ats_score (same baseline)
3. achievable_score_without_new_experience is realistic ceiling without adding new experience
4. Identify sections with match_percentage < 60% as weak
5. Priority levels: critical (< 40%), high (40-60%), medium (60-80%), low (> 80%)
6. Be honest: if resume can't reach 85+ without new experience, say so
7. Return ONLY valid JSON, no explanations`;

  const userPrompt = `Analyze this resume against the job description. Provide BOTH ATS analysis AND diagnostic insights in a single response.

JOB DESCRIPTION:
${jobDescription}

RESUME CONTENT (JSON):
${JSON.stringify(resumeContentJson, null, 2)}

Provide comprehensive analysis with:
1. ATS score and weak sections
2. Diagnostic assessment (gaps, fixability, recommendations)
3. Honest feedback on what's achievable

Return ONLY the JSON object, no markdown, no explanations.`;

  try {
    console.log(`📊 Analyzing resume with combined service (Provider: ${provider}, Model: ${model})...`);

    let responseText = '';

    if (provider === 'openai') {
      const openaiClient = new OpenAI({ apiKey: userConfig.apiKey });
      const response = await openaiClient.chat.completions.create({
        model,
        max_tokens: 4000,
        temperature: 0,  // Deterministic responses for consistent analysis
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
        temperature: 0,  // Deterministic responses for consistent analysis
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

    let analysis;
    try {
      analysis = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error(`❌ Failed to parse response as JSON`);
      console.error(`Response length: ${cleanedResponse.length}`);
      console.error(`Response preview (first 500 chars): ${cleanedResponse.substring(0, 500)}`);
      throw new Error(`Invalid JSON response: ${parseError.message}`);
    }

    // Validate that current_ats_score matches ats_score
    if (analysis.diagnostic && analysis.diagnostic.current_ats_score !== analysis.ats_score) {
      console.warn(`⚠️ Score mismatch: ats_score=${analysis.ats_score}, current_ats_score=${analysis.diagnostic.current_ats_score}`);
      // Force them to match
      analysis.diagnostic.current_ats_score = analysis.ats_score;
    }

    console.log(`✅ Analysis complete (Score: ${analysis.ats_score}/100, Achievable: ${analysis.diagnostic?.achievable_score_without_new_experience || 'N/A'}/100)\n`);
    return analysis;
  } catch (error) {
    console.error('❌ Analysis error:', error.message);
    throw error;
  }
}

export { analyzeResumeWithDiagnostic };
