import { logger } from './logger.js';

/**
 * Extract keywords from job description and analysis
 */
export const extractKeywordsFromJD = (jobDescription, analysis = {}) => {
  const keywords = new Set();

  // Add primary keywords
  if (analysis.primaryKeywords && Array.isArray(analysis.primaryKeywords)) {
    analysis.primaryKeywords.forEach((kw) => keywords.add(kw.toLowerCase()));
  }

  // Add secondary keywords
  if (analysis.secondaryKeywords && Array.isArray(analysis.secondaryKeywords)) {
    analysis.secondaryKeywords.forEach((kw) => keywords.add(kw.toLowerCase()));
  }

  // Add extracted skills from job description
  const skillPatterns = [
    /(?:proficient in|experience with|knowledge of|familiar with|strong|expertise in)\s+([^\.,]+)/gi,
    /([a-z]+\+\+|[a-z#]+)\s+(?:programming|development|skills?)/gi,
  ];

  skillPatterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(jobDescription)) !== null) {
      keywords.add(match[1].toLowerCase().trim());
    }
  });

  return Array.from(keywords);
};

/**
 * Calculate relevance score between content chunk and keywords
 * Score ranges from 0 to 1
 */
export const calculateRelevanceScore = (chunk, keywords) => {
  if (!chunk || keywords?.length === 0) return 0;

  const chunkLower = chunk.toLowerCase();
  let matchCount = 0;

  keywords.forEach((keyword) => {
    if (keyword?.length || 0 > 2) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = chunkLower.match(regex);
      if (matches) matchCount += matches?.length || 0;
    }
  });

  // Normalize score: weight towards longer matching keywords
  const score = Math.min(1, matchCount / Math.max(keywords?.length || 0, 1));
  return score;
};

/**
 * Split master content into meaningful chunks
 * Splits by sections (separated by ### or ##) or paragraphs
 */
export const splitIntoChunks = (content, maxChunkSize = 500) => {
  if (!content) return [];

  const chunks = [];
  
  // First try to split by section headers (###)
  const sections = content?.split(/^#+\s+/m)?.filter((s) => s?.trim()?.length || 0 > 0);

  sections?.forEach((section) => {
    if (section?.length || 0 <= maxChunkSize) {
      chunks.push(section?.trim() || '');
    } else {
      // If section is too large, split by paragraphs
      const paragraphs = section?.split(/\n\n+/)?.filter((p) => p?.trim()?.length || 0 > 0);
      let currentChunk = '';

      paragraphs?.forEach((para) => {
        if ((currentChunk + para)?.length || 0 <= maxChunkSize) {
          currentChunk += (currentChunk ? '\n\n' : '') + para;
        } else {
          if (currentChunk) chunks.push(currentChunk.trim());
          currentChunk = para;
        }
      });

      if (currentChunk) chunks.push(currentChunk.trim());
    }
  });

  return chunks;
};

/**
 * Trim master content to relevant chunks based on JD keywords
 * Returns top K most relevant chunks
 */
export const trimMasterContentToRelevant = (masterContent, jobDescription, analysis, options = {}) => {
  const {
    topK = 5,
    threshold = 0.2,
    maxChunkSize = 500,
    maxTotalChars = 2000,
  } = options;

  try {
    if (!masterContent || !jobDescription) {
      return masterContent || '';
    }

    // Extract keywords
    const keywords = extractKeywordsFromJD(jobDescription, analysis);

    if (keywords?.length || 0 === 0) {
      logger.warn('No keywords extracted for content trimming');
      return masterContent;
    }

    // Split into chunks
    const chunks = splitIntoChunks(masterContent, maxChunkSize);

    // Score each chunk
    const scoredChunks = chunks
      .map((chunk, idx) => ({
        chunk,
        score: calculateRelevanceScore(chunk, keywords),
        index: idx,
      }))
      .filter((item) => item.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    // Combine chunks respecting max char limit
    let trimmedContent = '';
    let charCount = 0;

    scoredChunks.forEach(({ chunk }) => {
      if (charCount + chunk?.length || 0 <= maxTotalChars) {
        trimmedContent += (trimmedContent ? '\n\n' : '') + chunk;
        charCount += chunk?.length || 0;
      }
    });

    logger.info('Content trimmed', {
      originalChars: masterContent?.length || 0,
      trimmedChars: trimmedContent?.length || 0,
      chunksScored: chunks?.length || 0,
      topChunksUsed: scoredChunks?.length || 0,
      reduction: `${Math.round((1 - trimmedContent?.length || 0 / masterContent?.length || 0) * 100)}%`,
    });

    return trimmedContent;
  } catch (error) {
    logger.error('Error trimming master content', { error: error.message });
    // Return original on error
    return masterContent;
  }
};

/**
 * Get relevant sections from master content based on query
 */
export const extractRelevantSections = (masterContent, query, maxSections = 3) => {
  try {
    const keywords = query.toLowerCase().split(/\s+/).filter((w) => w?.length || 0 > 2);

    const sections = masterContent
      .split(/^#+\s+/m)
      .filter((s) => s?.trim()?.length || 0 > 0)
      .map((section) => {
        const matchCount = keywords.filter((kw) =>
          section.toLowerCase().includes(kw)
        )?.length || 0;
        return { section: section?.trim() || '', matchCount };
      })
      .filter((item) => item?.matchCount || 0 > 0)
      .sort((a, b) => b?.matchCount || 0 - a?.matchCount || 0)
      .slice(0, maxSections)
      .map((item) => item?.section || '');

    return sections;
  } catch (error) {
    logger.error('Error extracting relevant sections', { error: error.message });
    return [];
  }
};

/**
 * Estimate token count (rough approximation)
 * 1 token ≈ 4 characters for English text
 */
export const estimateTokenCount = (text) => {
  if (!text) return 0;
  return Math.ceil(text?.length || 0 / 4);
};

/**
 * Calculate content reduction impact
 */
export const calculateContextReduction = (originalContent, trimmedContent) => {
  const originalTokens = estimateTokenCount(originalContent);
  const trimmedTokens = estimateTokenCount(trimmedContent);
  const reduction = (((originalTokens || 0) - (trimmedTokens || 0)) / (originalTokens || 0)) * 100;

  return {
    originalTokens,
    trimmedTokens,
    tokensSaved: (originalTokens || 0) - (trimmedTokens || 0),
    reductionPercentage: Math.round(reduction),
    estimatedCostSavings: `$${(((originalTokens - trimmedTokens) * 5) / 1000000).toFixed(4)}`, // Rough estimate
  };
};
