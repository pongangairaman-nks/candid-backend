/**
 * Utility functions for parsing and extracting sections from LaTeX resume content
 */

/**
 * Extract all sections from LaTeX content
 * @param {string} latexCode - LaTeX resume content
 * @returns {Array} Array of section objects with name, order, and content
 */
export const extractSectionsFromLatex = (latexCode) => {
  if (!latexCode || typeof latexCode !== 'string') {
    return [];
  }

  const sections = [];
  
  // Match both \section{Name} and \section*{Name} patterns
  const sectionRegex = /\\section\*?\{([^}]+)\}([\s\S]*?)(?=\\section|$)/g;
  let match;
  let order = 0;

  while ((match = sectionRegex.exec(latexCode)) !== null) {
    const sectionName = match[1].trim();
    const sectionContent = match[2].trim();

    sections.push({
      name: sectionName,
      order: order++,
      latexContent: match[0],
      contentLength: sectionContent.length,
      isActive: true,
    });
  }

  return sections;
};

/**
 * Get section names in order
 * @param {string} latexCode - LaTeX resume content
 * @returns {Array} Array of section names
 */
export const getSectionNames = (latexCode) => {
  const sections = extractSectionsFromLatex(latexCode);
  return sections.map((s) => s.name);
};

/**
 * Get a specific section by name
 * @param {string} latexCode - LaTeX resume content
 * @param {string} sectionName - Name of section to find
 * @returns {Object|null} Section object or null if not found
 */
export const getSectionByName = (latexCode, sectionName) => {
  const sections = extractSectionsFromLatex(latexCode);
  return sections.find((s) => s.name.toLowerCase() === sectionName.toLowerCase()) || null;
};

/**
 * Check if a text snippet belongs to a specific section
 * @param {string} text - Text to check
 * @param {string} sectionName - Section name to match
 * @returns {number} Confidence score (0-100)
 */
export const calculateSectionConfidence = (text, sectionName) => {
  if (!text || !sectionName) return 0;

  // Check for exact section header
  const headerRegex = new RegExp(`\\\\section\\*?\\{${sectionName}\\}`, 'i');
  if (headerRegex.test(text)) {
    return 100;
  }

  // Check for section name mention
  const nameRegex = new RegExp(`\\b${sectionName}\\b`, 'i');
  if (nameRegex.test(text)) {
    const wordCount = text.split(/\s+/).length;
    const matchCount = (text.match(nameRegex) || []).length;
    return Math.min((matchCount / wordCount) * 100, 100);
  }

  return 0;
};

/**
 * Detect which sections a text snippet belongs to
 * @param {string} text - Text to analyze
 * @param {Array} availableSections - Array of available section names
 * @returns {Object} { primarySection, allSections, confidence }
 */
export const detectSectionsInText = (text, availableSections = []) => {
  if (!text || !availableSections.length) {
    return {
      primarySection: 'Selected Text',
      allSections: [],
      confidence: 0,
    };
  }

  const detectedSections = availableSections
    .map((sectionName) => ({
      name: sectionName,
      confidence: calculateSectionConfidence(text, sectionName),
    }))
    .filter((s) => s.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);

  return {
    primarySection: detectedSections[0]?.name || 'Selected Text',
    allSections: detectedSections.map((s) => s.name),
    confidence: detectedSections[0]?.confidence || 0,
  };
};

/**
 * Format sections for API response
 * @param {Array} sections - Array of section objects
 * @returns {Array} Formatted sections
 */
export const formatSectionsForResponse = (sections) => {
  return sections.map((section) => ({
    name: section.name,
    order: section.order,
    isActive: section.isActive,
  }));
};
