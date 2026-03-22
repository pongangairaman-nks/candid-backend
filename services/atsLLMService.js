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
      overall_score: 72,
      keyword_gaps: ['AWS', 'CI/CD'],
      strengths: ['Strong JS/TS background'],
      critical_gaps: ['No explicit cloud tooling'],
    };
  }
  const provider = userConfig?.provider || 'openai';
  const model = userConfig?.model || mapDefaults[provider] || 'gpt-4o';
  const apiKey = userConfig?.apiKey;
  if (!apiKey) throw new Error('Analyzer API key not configured');

  const system = 'You are an ATS analyst. Compare requirements vs resume. Output JSON only.';
  const user = [
    'Given requirements and resume, map each requirement to: { "requirement_id": "r1", "match_strength": "STRONG|PARTIAL|WEAK|MISSING", "evidence": "short quote or null", "section_key": "summary|experience.exp_1|skills|education|projects|other", "suggestion": "advice or null" }.',
    'Return: { "mappings": [...], "overall_score": 0-100, "keyword_gaps": [...], "strengths": [...], "critical_gaps": [...] }',
    '',
    'Requirements:',
    JSON.stringify({ requirements }),
    '',
    'Resume:',
    resumeText,
  ].join('\n');

  const { text } = await callLLM({ provider, model, apiKey, system, user, maxTokens: 3000, temperature: 0.2 });
  const json = parseJson(text);
  if (!json.mappings || typeof json.overall_score !== 'number') throw new Error('Invalid mapping JSON');
  return {
    mappings: json.mappings,
    overall_score: json.overall_score,
    keyword_gaps: Array.isArray(json.keyword_gaps) ? json.keyword_gaps : [],
    strengths: Array.isArray(json.strengths) ? json.strengths : [],
    critical_gaps: Array.isArray(json.critical_gaps) ? json.critical_gaps : [],
  };
};

export const incrementalRescoreLLM = async ({ affectedMappings, beforeText, afterText, baselineScore }, userConfig) => {
  if (process.env.LLM_STUB === 'true') {
    const updated = (affectedMappings || []).slice(0, 2).map(a => ({ requirement_id: a.requirement_id, match_strength: 'STRONG', was: a.previous || 'MISSING' }));
    const delta = Math.min(15, updated.length * 5);
    return { updated_mappings: updated, score_delta: delta, new_overall_score: baselineScore + delta };
  }
  const provider = userConfig?.provider || 'openai';
  const model = userConfig?.model || cheapDefaults[provider] || 'gpt-4o-mini';
  const apiKey = userConfig?.apiKey;
  if (!apiKey) throw new Error('Analyzer API key not configured');

  const system = 'You are an ATS analyst. Re-score only affected requirements. JSON only.';
  const user = [
    'A resume section changed. Re-evaluate only these requirements (array of objects with requirement_id and previous match_strength).',
    JSON.stringify({ affected_requirements: affectedMappings, baseline_score: baselineScore }),
    '',
    'Old section:',
    beforeText || '',
    '',
    'New section:',
    afterText || '',
    '',
    'Return JSON: { "updated_mappings": [ { "requirement_id": "r2", "match_strength": "STRONG", "was": "PARTIAL" } ], "score_delta": +/-N, "new_overall_score": N }',
  ].join('\n');

  const { text } = await callLLM({ provider, model, apiKey, system, user, maxTokens: 1200, temperature: 0.1 });
  const json = parseJson(text);
  if (!Array.isArray(json.updated_mappings)) throw new Error('Invalid incremental JSON');
  if (typeof json.new_overall_score !== 'number') json.new_overall_score = baselineScore + (json.score_delta || 0);
  return {
    updated_mappings: json.updated_mappings,
    score_delta: typeof json.score_delta === 'number' ? json.score_delta : (json.new_overall_score - baselineScore),
    new_overall_score: json.new_overall_score,
  };
};
