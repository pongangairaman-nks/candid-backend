/**
 * Resume Render Service
 * 
 * Handles:
 * 1. Rendering LaTeX from Handlebars template + JSON (deterministic, no LLM)
 * 2. Validating rendered LaTeX for completeness and structure
 */

const Handlebars = require('handlebars');

/**
 * Render LaTeX from Handlebars template + JSON content
 * Deterministic rendering - no LLM involved
 * 
 * @param {string} template - Handlebars template with {{placeholders}}
 * @param {Object} contentJson - Resume content JSON
 * @returns {string} - Rendered LaTeX
 */
function renderLatex(template, contentJson) {
  if (!template || template.trim().length === 0) {
    throw new Error('Template cannot be empty');
  }

  if (!contentJson) {
    throw new Error('Content JSON is required');
  }

  try {
    console.log('🔄 Rendering LaTeX from template + JSON...');

    // Compile Handlebars template
    const compiledTemplate = Handlebars.compile(template);

    // Render with content
    const renderedLatex = compiledTemplate(contentJson);

    if (!renderedLatex || renderedLatex.trim().length === 0) {
      throw new Error('Rendered LaTeX is empty');
    }

    // Validate rendered LaTeX
    const validation = validateLatex(renderedLatex);
    if (!validation.isValid) {
      console.error('❌ LaTeX validation failed:', validation.errors);
      throw new Error(`LaTeX validation failed: ${validation.errors.join(', ')}`);
    }

    console.log('✅ LaTeX rendering successful');
    return renderedLatex;
  } catch (error) {
    console.error('❌ LaTeX rendering error:', error.message);
    throw error;
  }
}

/**
 * Validate rendered LaTeX for completeness and structure
 * 
 * Checks:
 * 1. Required LaTeX commands and environments
 * 2. Balanced braces and brackets
 * 3. Presence of \end{document}
 * 4. No unresolved Handlebars placeholders
 * 
 * @param {string} latex - Rendered LaTeX string
 * @returns {Object} - { isValid: boolean, errors: string[] }
 */
function validateLatex(latex) {
  const errors = [];

  if (!latex || latex.trim().length === 0) {
    errors.push('LaTeX content cannot be empty');
    return { isValid: false, errors };
  }

  // Check for required LaTeX structure
  if (!latex.includes('\\documentclass')) {
    errors.push('Missing \\documentclass command');
  }

  if (!latex.includes('\\begin{document}')) {
    errors.push('Missing \\begin{document}');
  }

  if (!latex.includes('\\end{document}')) {
    errors.push('Missing \\end{document}');
  }

  // Check for unresolved Handlebars placeholders
  const unresolvedPlaceholders = latex.match(/\{\{[^}]*\}\}/g);
  if (unresolvedPlaceholders && unresolvedPlaceholders.length > 0) {
    errors.push(`Unresolved placeholders: ${unresolvedPlaceholders.join(', ')}`);
  }

  // Check for balanced braces
  const braceBalance = checkBraceBalance(latex);
  if (!braceBalance.isBalanced) {
    errors.push(`Unbalanced braces: ${braceBalance.message}`);
  }

  // Check for balanced brackets
  const bracketBalance = checkBracketBalance(latex);
  if (!bracketBalance.isBalanced) {
    errors.push(`Unbalanced brackets: ${bracketBalance.message}`);
  }

  // Check for balanced LaTeX environments
  const envBalance = checkEnvironmentBalance(latex);
  if (!envBalance.isBalanced) {
    errors.push(`Unbalanced environments: ${envBalance.message}`);
  }

  // Check for common LaTeX errors
  const commonErrors = checkCommonLatexErrors(latex);
  if (commonErrors.length > 0) {
    errors.push(...commonErrors);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Check if braces are balanced in LaTeX
 * Ignores braces inside comments and strings
 * 
 * @param {string} latex - LaTeX content
 * @returns {Object} - { isBalanced: boolean, message: string }
 */
function checkBraceBalance(latex) {
  let balance = 0;
  let minBalance = 0;

  for (let i = 0; i < latex.length; i++) {
    const char = latex[i];

    // Skip comments
    if (char === '%') {
      while (i < latex.length && latex[i] !== '\n') {
        i++;
      }
      continue;
    }

    if (char === '{') {
      balance++;
    } else if (char === '}') {
      balance--;
      if (balance < minBalance) {
        minBalance = balance;
      }
    }
  }

  if (balance !== 0) {
    return {
      isBalanced: false,
      message: `Final balance: ${balance} (${balance > 0 ? 'missing closing braces' : 'extra closing braces'})`
    };
  }

  if (minBalance < 0) {
    return {
      isBalanced: false,
      message: `Closing brace before opening brace at balance ${minBalance}`
    };
  }

  return { isBalanced: true, message: 'Braces are balanced' };
}

/**
 * Check if brackets are balanced in LaTeX
 * 
 * @param {string} latex - LaTeX content
 * @returns {Object} - { isBalanced: boolean, message: string }
 */
function checkBracketBalance(latex) {
  let balance = 0;

  for (let i = 0; i < latex.length; i++) {
    const char = latex[i];

    // Skip comments
    if (char === '%') {
      while (i < latex.length && latex[i] !== '\n') {
        i++;
      }
      continue;
    }

    if (char === '[') {
      balance++;
    } else if (char === ']') {
      balance--;
    }
  }

  if (balance !== 0) {
    return {
      isBalanced: false,
      message: `Final balance: ${balance}`
    };
  }

  return { isBalanced: true, message: 'Brackets are balanced' };
}

/**
 * Check if LaTeX environments are balanced
 * e.g., \begin{document} ... \end{document}
 * 
 * @param {string} latex - LaTeX content
 * @returns {Object} - { isBalanced: boolean, message: string }
 */
function checkEnvironmentBalance(latex) {
  const beginPattern = /\\begin\{(\w+)\}/g;
  const beginMatches = [];
  let match;

  while ((match = beginPattern.exec(latex)) !== null) {
    beginMatches.push(match[1]);
  }

  const endPattern = /\\end\{(\w+)\}/g;
  const endMatches = [];

  while ((match = endPattern.exec(latex)) !== null) {
    endMatches.push(match[1]);
  }

  // Check if all begin environments have corresponding end
  const unmatched = [];
  for (const env of beginMatches) {
    const endIndex = endMatches.indexOf(env);
    if (endIndex === -1) {
      unmatched.push(`Missing \\end{${env}}`);
    } else {
      endMatches.splice(endIndex, 1);
    }
  }

  if (unmatched.length > 0) {
    return {
      isBalanced: false,
      message: unmatched.join(', ')
    };
  }

  if (endMatches.length > 0) {
    return {
      isBalanced: false,
      message: `Extra \\end{${endMatches.join('}, \\end{')}}`
    };
  }

  return { isBalanced: true, message: 'Environments are balanced' };
}

/**
 * Check for common LaTeX errors
 * 
 * @param {string} latex - LaTeX content
 * @returns {Array} - Array of error messages
 */
function checkCommonLatexErrors(latex) {
  const errors = [];

  // Check for unescaped special characters (outside of commands)
  const specialCharsPattern = /[#$&%_^~]/g;
  const matches = latex.match(specialCharsPattern);
  if (matches && matches.length > 0) {
    // This is just a warning, not necessarily an error
    // LaTeX allows these in certain contexts
  }

  // Check for missing required packages (basic check)
  if (latex.includes('\\usepackage') && !latex.includes('\\documentclass')) {
    errors.push('\\usepackage found before \\documentclass');
  }

  // Check for empty environments
  const emptyEnvPattern = /\\begin\{(\w+)\}\s*\\end\{\1\}/g;
  const emptyEnvMatches = latex.match(emptyEnvPattern);
  if (emptyEnvMatches && emptyEnvMatches.length > 0) {
    // Empty environments might be intentional, just log as warning
  }

  return errors;
}

/**
 * Get LaTeX statistics
 * Useful for debugging and monitoring
 * 
 * @param {string} latex - LaTeX content
 * @returns {Object} - Statistics about the LaTeX
 */
function getLatexStats(latex) {
  return {
    totalCharacters: latex.length,
    totalLines: latex.split('\n').length,
    totalWords: latex.split(/\s+/).length,
    hasDocumentclass: latex.includes('\\documentclass'),
    hasBeginDocument: latex.includes('\\begin{document}'),
    hasEndDocument: latex.includes('\\end{document}'),
    commandCount: (latex.match(/\\/g) || []).length,
    environmentCount: (latex.match(/\\begin\{/g) || []).length,
    unresolvedPlaceholders: (latex.match(/\{\{[^}]*\}\}/g) || []).length
  };
}

module.exports = {
  renderLatex,
  validateLatex,
  checkBraceBalance,
  checkBracketBalance,
  checkEnvironmentBalance,
  checkCommonLatexErrors,
  getLatexStats
};
