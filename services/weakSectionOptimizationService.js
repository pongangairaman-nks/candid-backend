/**
 * Weak Section Optimization Service
 * 
 * Handles:
 * 1. Optimizing individual weak sections using LLM
 * 2. Preserving meaning, metrics, and tone
 * 3. Integrating job description keywords naturally
 * 4. Iteration-aware prompts for smarter optimization
 */

const Anthropic = require('@anthropic-ai/sdk');
const { getNestedValue, setNestedValue } = require('../schemas/resumeContentSchema');

/**
 * Optimize weak sections identified by ATS analysis
 * Iteration-aware: Uses different strategies for iteration 1, 2, 3
 * 
 * @param {Object} contentJson - Resume content JSON
 * @param {Object} atsAnalysis - ATS analysis with weak sections
 * @param {string} jobDescription - Raw job description
 * @param {Object} userConfig - User's LLM config
 * @param {number} iteration - Current iteration number (1, 2, or 3)
 * @returns {Promise<Object>} - Optimized content JSON
 */
async function optimizeWeakSectionsV2(
  contentJson,
  atsAnalysis,
  jobDescription,
  userConfig,
  iteration = 1
) {
  if (!contentJson) {
    throw new Error('Content JSON is required');
  }

  if (!atsAnalysis || !atsAnalysis.weak_sections) {
    throw new Error('ATS analysis with weak sections is required');
  }

  if (!jobDescription || jobDescription.trim().length === 0) {
    throw new Error('Job description is required');
  }

  if (!userConfig || !userConfig.apiKey) {
    throw new Error('User LLM config is required');
  }

  const client = new Anthropic({ apiKey: userConfig.apiKey });
  const model = userConfig.model || 'claude-3-5-sonnet-latest';

  // Deep copy to avoid mutating original
  const optimizedContent = JSON.parse(JSON.stringify(contentJson));

  // Sort weak sections by priority (critical first)
  const sortedWeakSections = (atsAnalysis.weak_sections || []).sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  console.log(`\n    Weak sections to optimize (${sortedWeakSections.length}):`);
  sortedWeakSections.forEach((section, idx) => {
    console.log(`    ${idx + 1}. ${section.section_name} (${section.priority}) - ${section.match_percentage}% match`);
  });

  // Optimize each weak section
  for (const weakSection of sortedWeakSections) {
    try {
      console.log(`\n    🔄 Optimizing: ${weakSection.section_name}...`);

      // Get the section from content
      const sectionPath = weakSection.section_key.split('.');
      const section = getNestedValue(optimizedContent, sectionPath);

      if (!section) {
        console.warn(`    ⚠️ Section not found: ${weakSection.section_key}`);
        continue;
      }

      // Create iteration-aware prompt
      const prompt = createOptimizationPrompt(
        section,
        weakSection,
        jobDescription,
        iteration
      );

      // Call Claude to optimize
      const response = await client.messages.create({
        model,
        max_tokens: 2000,
        system: getOptimizationSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const responseText = response.content[0].type === 'text' ? response.content[0].text : '';

      if (!responseText) {
        console.warn(`    ⚠️ Empty response for ${weakSection.section_name}`);
        continue;
      }

      // Parse optimized content
      let optimizedSection;
      try {
        optimizedSection = JSON.parse(responseText);
      } catch (parseError) {
        console.error(`    ❌ Failed to parse optimization response as JSON`);
        console.error(`    Response: ${responseText.substring(0, 300)}`);
        continue;
      }

      // Validate optimized section
      if (!optimizedSection || typeof optimizedSection !== 'object') {
        console.warn(`    ⚠️ Invalid optimized section format`);
        continue;
      }

      // Update section in content
      if (section.type === 'text') {
        // For text sections, update content directly
        section.content = optimizedSection.content || optimizedSection;
      } else if (section.type === 'list' && Array.isArray(section.items)) {
        // For list sections, update items
        if (Array.isArray(optimizedSection.items)) {
          section.items = optimizedSection.items;
        } else if (Array.isArray(optimizedSection)) {
          section.items = optimizedSection;
        }
      }

      setNestedValue(optimizedContent, sectionPath, section);
      console.log(`    ✅ Optimized: ${weakSection.section_name}`);
    } catch (error) {
      console.error(`    ❌ Failed to optimize ${weakSection.section_name}:`, error.message);
      // Continue with next section on error
    }
  }

  return optimizedContent;
}

/**
 * Get system prompt for optimization
 * Emphasizes preservation of meaning and metrics
 * 
 * @returns {string} - System prompt
 */
function getOptimizationSystemPrompt() {
  return `You are an expert resume optimizer specializing in ATS optimization.

Your task is to improve resume content to match job description requirements while strictly preserving:
1. Original meaning and achievements
2. All metrics, numbers, and quantifiable results
3. Professional tone and style
4. Factual accuracy (no exaggeration or false claims)

You will receive a resume section and optimization guidance. Return ONLY the optimized content in the same JSON format as the input.

CRITICAL RULES:
- PRESERVE all numbers, metrics, and quantifiable achievements
- PRESERVE the original meaning and intent
- ONLY add/integrate keywords naturally
- NO keyword stuffing or forced language
- NO false claims or exaggeration
- NO removal of important information
- Maintain professional tone throughout

Return ONLY valid JSON matching the input structure, no explanations.`;
}

/**
 * Create iteration-aware optimization prompt
 * Different strategies for iteration 1, 2, 3
 * 
 * @param {Object} section - Resume section to optimize
 * @param {Object} weakSection - Weak section analysis
 * @param {string} jobDescription - Job description
 * @param {number} iteration - Current iteration (1, 2, or 3)
 * @returns {string} - Optimization prompt
 */
function createOptimizationPrompt(section, weakSection, jobDescription, iteration) {
  const basePrompt = `Optimize this resume section to better match the job description.

SECTION TYPE: ${section.type}
SECTION NAME: ${weakSection.section_name}
CURRENT MATCH: ${weakSection.match_percentage}%
PRIORITY: ${weakSection.priority}

REASON FOR WEAK MATCH:
${weakSection.reason}

MISSING KEYWORDS:
${weakSection.missing_keywords.join(', ')}

JOB DESCRIPTION EXCERPT:
${jobDescription.substring(0, 1500)}

CURRENT SECTION:
${JSON.stringify(section, null, 2)}

OPTIMIZATION GOAL:
${weakSection.suggestion}`;

  // Iteration-specific instructions
  let iterationInstructions = '';

  if (iteration === 1) {
    iterationInstructions = `

ITERATION 1 STRATEGY:
1. Focus on naturally integrating the missing keywords
2. Reword sentences to highlight relevant skills and experience
3. Emphasize achievements that align with job requirements
4. Keep the same structure and flow
5. Ensure all metrics and numbers are preserved`;
  } else if (iteration === 2) {
    iterationInstructions = `

ITERATION 2 STRATEGY:
1. This is the second optimization pass - previous attempts may not have fully integrated keywords
2. Look for additional opportunities to mention relevant technologies and skills
3. Consider rephrasing to emphasize different aspects of achievements
4. Add context around metrics to show relevance to job requirements
5. Ensure keywords are contextually relevant (not forced)`;
  } else {
    iterationInstructions = `

ITERATION 3 STRATEGY:
1. Final optimization pass - focus on quality over quantity
2. Ensure all keywords are naturally integrated
3. Verify that meaning and metrics are fully preserved
4. Polish language for maximum impact
5. Ensure no keyword stuffing or forced language`;
  }

  return basePrompt + iterationInstructions + `

Return ONLY the optimized section in the same JSON format as the input. No explanations.`;
}

/**
 * Validate optimized section
 * Ensures structure is preserved
 * 
 * @param {Object} original - Original section
 * @param {Object} optimized - Optimized section
 * @returns {Object} - { isValid: boolean, errors: string[] }
 */
function validateOptimizedSection(original, optimized) {
  const errors = [];

  if (!optimized) {
    errors.push('Optimized section is empty');
    return { isValid: false, errors };
  }

  // Validate type preservation
  if (original.type !== optimized.type) {
    errors.push(`Type mismatch: expected ${original.type}, got ${optimized.type}`);
  }

  // Validate text sections
  if (original.type === 'text') {
    if (!optimized.content || typeof optimized.content !== 'string') {
      errors.push('Text section must have content property');
    }
  }

  // Validate list sections
  if (original.type === 'list') {
    if (!Array.isArray(optimized.items)) {
      errors.push('List section must have items array');
    }
    if (optimized.items && optimized.items.length === 0) {
      errors.push('List section items cannot be empty');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Extract text from section for analysis
 * 
 * @param {Object} section - Resume section
 * @returns {string} - Combined text from section
 */
function extractSectionText(section) {
  if (!section) return '';

  if (section.type === 'text' && section.content) {
    return section.content;
  }

  if (section.type === 'list' && Array.isArray(section.items)) {
    return section.items
      .map(item => {
        if (item.content) return item.content;
        if (item.bullets) return item.bullets.map(b => b.content).join(' ');
        return Object.values(item).filter(v => typeof v === 'string').join(' ');
      })
      .join(' ');
  }

  return '';
}

/**
 * Count keywords in section text
 * 
 * @param {string} sectionText - Section text
 * @param {Array} keywords - Keywords to count
 * @returns {Object} - { count: number, percentage: number }
 */
function countKeywordsInSection(sectionText, keywords) {
  if (!sectionText || !keywords || keywords.length === 0) {
    return { count: 0, percentage: 0 };
  }

  const lowerText = sectionText.toLowerCase();
  let count = 0;

  keywords.forEach(keyword => {
    if (lowerText.includes(keyword.toLowerCase())) {
      count++;
    }
  });

  const percentage = (count / keywords.length) * 100;

  return {
    count,
    percentage: Math.round(percentage),
    total_keywords: keywords.length
  };
}

module.exports = {
  optimizeWeakSectionsV2,
  getOptimizationSystemPrompt,
  createOptimizationPrompt,
  validateOptimizedSection,
  extractSectionText,
  countKeywordsInSection
};
