import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

const cheapDefaults = {
  claude: 'claude-3-haiku-20240307',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.5-flash',
};

const mapDefaults = {
  claude: 'claude-3-5-sonnet-latest',
  openai: 'gpt-4o',
  gemini: 'gemini-2.5-pro',
};

const callAnthropic = async (apiKey, model, system, user, maxTokens = 1500, temperature = 0.2) => {
  const client = new Anthropic({ apiKey });
  const resp = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const text = resp?.content?.[0]?.text || '';
  return { text };
};

const callOpenAI = async (apiKey, model, system, user, maxTokens = 1500, temperature = 0.2) => {
  const client = new OpenAI({ apiKey });
  const resp = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  const text = resp?.choices?.[0]?.message?.content || '';
  return { text, usage: resp?.usage };
};

const callGemini = async (apiKey, model, system, user) => {
  const ai = new GoogleGenAI({ apiKey });
  const generateContent = ai.models.generateContent;
  const prompt = `${system}\n\n${user}`;
  const result = await generateContent({ model, contents: prompt });
  let text;
  if (typeof result.text === 'function') text = result.text();
  else if (result.text) text = result.text;
  else if (result.candidates && result.candidates[0]) text = result.candidates[0].content.parts[0].text;
  else text = '';
  return { text };
};

const callLLM = async ({ provider, model, apiKey, system, user, maxTokens, temperature }) => {
  if (provider === 'claude') return callAnthropic(apiKey, model, system, user, maxTokens, temperature);
  if (provider === 'openai') return callOpenAI(apiKey, model, system, user, maxTokens, temperature);
  if (provider === 'gemini') return callGemini(apiKey, model, system, user);
  throw new Error(`Unsupported provider: ${provider}`);
};

const parseJson = (text) => {
  if (!text) throw new Error('Empty LLM response');
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  let str = cleaned;
  if (!str.startsWith('{') && !str.startsWith('[')) {
    const m = str.match(/[\[{][\s\S]*[\]}]/);
    if (m) str = m[0];
  }
  return JSON.parse(str);
};

export const extractRequirementsLLM = async (jobDescription, userConfig) => {
  if (process.env.LLM_STUB === 'true') {
    return [
      { id: 'r1', text: '5+ years experience in JavaScript/TypeScript', category: 'experience', priority: 'required' },
      { id: 'r2', text: 'AWS infrastructure (EC2, Lambda, S3)', category: 'hard_skill', priority: 'required' },
      { id: 'r3', text: 'CI/CD pipelines (GitHub Actions, Jenkins)', category: 'hard_skill', priority: 'preferred' },
      { id: 'r4', text: 'Team leadership and collaboration', category: 'soft_skill', priority: 'preferred' }
    ];
  }
  const provider = userConfig?.provider || 'openai';
  const model = userConfig?.model || cheapDefaults[provider] || 'gpt-4o-mini';
  const apiKey = userConfig?.apiKey;
  if (!apiKey) throw new Error('Analyzer API key not configured');

  const system = 'You are an ATS analyst. Extract job requirements as strict JSON.';
  const user = [
    'Extract requirements from this JD. Categorize each as one of: hard_skill | soft_skill | experience | education | responsibility. Mark priority as required or preferred. Return JSON only with shape { "requirements": [ { "id": "r<N>", "text": "...", "category": "hard_skill", "priority": "required" } ] }',
    '',
    'JD:',
    jobDescription,
  ].join('\n');

  const { text } = await callLLM({ provider, model, apiKey, system, user, maxTokens: 1200, temperature: 0.1 });
  const json = parseJson(text);
  const reqs = Array.isArray(json) ? json : json.requirements;
  if (!Array.isArray(reqs)) throw new Error('Invalid requirements JSON');
  const withIds = reqs.map((r, i) => ({ id: r.id || `r${i + 1}`, text: String(r.text || '').trim(), category: String(r.category || 'hard_skill'), priority: String(r.priority || 'required') }));
  return withIds;
};

export const mapRequirementsToResumeLLM = async (requirements, resumeText, userConfig) => {
  if (process.env.LLM_STUB === 'true') {
    const mappings = requirements.map((r, idx) => ({
      requirement_id: r.id,
      match_strength: idx % 3 === 0 ? 'STRONG' : idx % 3 === 1 ? 'PARTIAL' : 'MISSING',
      evidence: idx % 3 === 0 ? 'Demonstrated in recent project bullet' : null,
      section_key: idx % 2 === 0 ? 'experience.exp_1' : 'summary',
      suggestion: idx % 3 === 2 ? 'Add explicit mention with metrics' : null,
    }));
    return {
      mappings,
      overallScore: 72,
      keywordGaps: ['AWS', 'CI/CD'],
      strengths: ['Strong JS/TS background'],
      criticalGaps: ['No explicit cloud tooling'],
    };
  }
  const provider = userConfig?.provider || 'openai';
  const model = userConfig?.model || mapDefaults[provider] || 'gpt-4o';
  const apiKey = userConfig?.apiKey;
  if (!apiKey) throw new Error('Analyzer API key not configured');

  const system = 'You are an ATS analyst. Compare requirements vs resume. Output JSON only.';
  const user = [
    'Given requirements and resume, map each requirement to: { "requirementId": "r1", "matchStrength": "STRONG|PARTIAL|WEAK|MISSING", "evidence": "short quote or null", "sectionKey": "summary|experience.exp_1|skills|education|projects|other", "suggestion": "advice or null" }.',
    'Return: { "mappings": [...], "overallScore": 0-100, "keywordGaps": [...], "strengths": [...], "criticalGaps": [...] }',
    '',
    'Requirements:',
    JSON.stringify({ requirements }),
    '',
    'Resume:',
    resumeText,
  ].join('\n');

  const { text } = await callLLM({ provider, model, apiKey, system, user, maxTokens: 3000, temperature: 0.2 });
  const json = parseJson(text);
  if (!json.mappings || typeof json.overallScore !== 'number') throw new Error('Invalid mapping JSON');
  return {
    mappings: json.mappings,
    overallScore: json.overallScore,
    keywordGaps: Array.isArray(json.keywordGaps) ? json.keywordGaps : [],
    strengths: Array.isArray(json.strengths) ? json.strengths : [],
    criticalGaps: Array.isArray(json.criticalGaps) ? json.criticalGaps : [],
  };
};

export const incrementalRescoreLLM = async ({ affectedMappings, beforeText, afterText, baselineScore }, userConfig) => {
  if (process.env.LLM_STUB === 'true') {
    const updated = (affectedMappings || []).slice(0, 2).map(a => ({ requirementId: a.requirementId, matchStrength: 'STRONG', was: a.previous || 'MISSING' }));
    const delta = Math.min(15, updated?.length || 0 * 5);
    return { updatedMappings: updated, scoreDelta: delta, newOverallScore: baselineScore + delta };
  }
  const provider = userConfig?.provider || 'openai';
  const model = userConfig?.model || cheapDefaults[provider] || 'gpt-4o-mini';
  const apiKey = userConfig?.apiKey;
  if (!apiKey) throw new Error('Analyzer API key not configured');

  const system = 'You are an ATS analyst. Re-score only affected requirements. JSON only.';
  const user = [
    'A resume section changed. Re-evaluate only these requirements (array of objects with requirementId and previous matchStrength).',
    JSON.stringify({ affectedRequirements: affectedMappings, baselineScore: baselineScore }),
    '',
    'Old section:',
    beforeText || '',
    '',
    'New section:',
    afterText || '',
    '',
    'Return JSON: { "updatedMappings": [ { "requirementId": "r2", "matchStrength": "STRONG", "was": "PARTIAL" } ], "scoreDelta": +/-N, "newOverallScore": N }',
  ].join('\n');

  const { text } = await callLLM({ provider, model, apiKey, system, user, maxTokens: 1200, temperature: 0.1 });
  const json = parseJson(text);
  if (!Array.isArray(json.updatedMappings)) throw new Error('Invalid incremental JSON');
  if (typeof json.newOverallScore !== 'number') json.newOverallScore = baselineScore + (json.scoreDelta || 0);
  return {
    updatedMappings: json.updatedMappings,
    scoreDelta: typeof json.scoreDelta === 'number' ? json.scoreDelta : (json.newOverallScore - baselineScore),
    newOverallScore: json.newOverallScore,
  };
};
