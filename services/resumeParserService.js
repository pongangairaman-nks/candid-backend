/**
 * Resume Parser Service
 * 
 * Handles:
 * 1. Extracting structured JSON from LaTeX resume
 * 2. Converting LaTeX to Handlebars template
 * 3. Validating Handlebars templates
 */

const Anthropic = require('@anthropic-ai/sdk');
const { validateResumeContent } = require('../schemas/resumeContentSchema');

/**
 * Extract JSON content from LaTeX resume
 * Uses Claude to parse LaTeX and return structured JSON
 * 
 * @param {string} latexContent - Raw LaTeX resume content
 * @param {Object} userConfig - User's LLM config { apiKey, model }
 * @returns {Promise<Object>} - Extracted resume content JSON
 */
async function extractJsonFromLatex(latexContent, userConfig) {
  if (!latexContent || latexContent.trim().length === 0) {
    throw new Error('LaTeX content cannot be empty');
  }

  if (!userConfig || !userConfig.apiKey) {
    throw new Error('User LLM config is required');
  }

  const client = new Anthropic({ apiKey: userConfig.apiKey });
  const model = userConfig.model || 'claude-3-5-sonnet-latest';

  const systemPrompt = `You are an expert at parsing LaTeX resumes and extracting structured data.

Your task is to extract resume content from LaTeX and return it as a JSON object.

The JSON structure should follow this format:
{
  "metadata": {
    "name": "Full Name",
    "email": "email@example.com",
    "phone": "+1-xxx-xxx-xxxx",
    "location": "City, State",
    "links": [
      { "label": "GitHub", "url": "https://..." },
      { "label": "LinkedIn", "url": "https://..." }
    ]
  },
  "sections": {
    "summary": {
      "type": "text",
      "title": "Professional Summary",
      "content": "..."
    },
    "skills": {
      "type": "list",
      "title": "Core Skills",
      "items": [
        { "id": "skill_1", "category": "Backend", "content": "..." },
        { "id": "skill_2", "category": "Frontend", "content": "..." }
      ]
    },
    "experience": {
      "type": "list",
      "title": "Professional Experience",
      "items": [
        {
          "id": "exp_1",
          "company": "Company Name",
          "position": "Job Title",
          "duration": "Jan 2020 - Dec 2021",
          "location": "City, State",
          "bullets": [
            { "id": "exp_1_bullet_1", "content": "Achievement 1" },
            { "id": "exp_1_bullet_2", "content": "Achievement 2" }
          ]
        }
      ]
    },
    "projects": {
      "type": "list",
      "title": "Projects",
      "items": [
        {
          "id": "proj_1",
          "name": "Project Name",
          "description": "Description",
          "technologies": ["Tech1", "Tech2"],
          "bullets": [
            { "id": "proj_1_bullet_1", "content": "..." }
          ]
        }
      ]
    },
    "education": {
      "type": "list",
      "title": "Education",
      "items": [
        {
          "id": "edu_1",
          "institution": "University Name",
          "degree": "Bachelor of Science",
          "field": "Computer Science",
          "graduationYear": "2020",
          "details": ["GPA: 3.8/4.0"]
        }
      ]
    },
    "certifications": {
      "type": "list",
      "title": "Certifications",
      "items": [
        {
          "id": "cert_1",
          "name": "Certification Name",
          "issuer": "Issuer",
          "date": "Mar 2022",
          "credentialUrl": "https://..."
        }
      ]
    }
  }
}

IMPORTANT RULES:
1. Extract EXACTLY what's in the resume - don't add or modify content
2. Preserve all metrics, numbers, and achievements
3. Use unique IDs: skill_1, skill_2, exp_1, exp_1_bullet_1, exp_1_bullet_2, etc.
4. If a section doesn't exist in the resume, omit it from the JSON
5. Return ONLY valid JSON, no explanations
6. Preserve the exact text from the LaTeX (don't paraphrase)`;

  const userPrompt = `Extract the resume content from this LaTeX and return as JSON:

${latexContent}

Return ONLY the JSON object, no markdown, no explanations.`;

  try {
    console.log('🔍 Extracting JSON from LaTeX...');
    
    const response = await client.messages.create({
      model,
      max_tokens: 8000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    });

    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    
    if (!responseText) {
      throw new Error('Empty response from Claude');
    }

    // Parse JSON response
    let extractedJson;
    try {
      extractedJson = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ Failed to parse Claude response as JSON');
      console.error('Response:', responseText.substring(0, 500));
      throw new Error(`Invalid JSON response from Claude: ${parseError.message}`);
    }

    // Validate extracted content
    const validation = validateResumeContent(extractedJson);
    if (!validation.isValid) {
      console.warn('⚠️ Validation warnings:', validation.errors);
    }

    console.log('✅ JSON extraction successful');
    return extractedJson;
  } catch (error) {
    console.error('❌ JSON extraction error:', error.message);
    throw error;
  }
}

/**
 * Convert LaTeX resume to Handlebars template
 * Replaces dynamic content with {{placeholders}}
 * 
 * @param {string} latexContent - Raw LaTeX resume content
 * @param {Object} extractedJson - Extracted resume JSON (for reference)
 * @returns {Promise<string>} - LaTeX template with Handlebars placeholders
 */
async function convertLatexToTemplate(latexContent, extractedJson) {
  if (!latexContent || latexContent.trim().length === 0) {
    throw new Error('LaTeX content cannot be empty');
  }

  if (!extractedJson) {
    throw new Error('Extracted JSON is required for template conversion');
  }

  try {
    console.log('🔄 Converting LaTeX to Handlebars template...');

    let template = latexContent;

    // Replace metadata
    if (extractedJson.metadata?.name) {
      template = template.replace(
        new RegExp(escapeRegex(extractedJson.metadata.name), 'g'),
        '{{metadata.name}}'
      );
    }
    if (extractedJson.metadata?.email) {
      template = template.replace(
        new RegExp(escapeRegex(extractedJson.metadata.email), 'g'),
        '{{metadata.email}}'
      );
    }
    if (extractedJson.metadata?.phone) {
      template = template.replace(
        new RegExp(escapeRegex(extractedJson.metadata.phone), 'g'),
        '{{metadata.phone}}'
      );
    }
    if (extractedJson.metadata?.location) {
      template = template.replace(
        new RegExp(escapeRegex(extractedJson.metadata.location), 'g'),
        '{{metadata.location}}'
      );
    }

    // Replace section content
    const sections = extractedJson.sections || {};

    // Summary section
    if (sections.summary?.content) {
      template = template.replace(
        new RegExp(escapeRegex(sections.summary.content), 'g'),
        '{{sections.summary.content}}'
      );
    }

    // Skills section
    if (sections.skills?.items) {
      sections.skills.items.forEach((skill, index) => {
        if (skill.content) {
          template = template.replace(
            new RegExp(escapeRegex(skill.content), 'g'),
            `{{sections.skills.items.${index}.content}}`
          );
        }
      });
    }

    // Experience section
    if (sections.experience?.items) {
      sections.experience.items.forEach((exp, expIndex) => {
        // Replace company, position, duration, location
        if (exp.company) {
          template = template.replace(
            new RegExp(escapeRegex(exp.company), 'g'),
            `{{sections.experience.items.${expIndex}.company}}`
          );
        }
        if (exp.position) {
          template = template.replace(
            new RegExp(escapeRegex(exp.position), 'g'),
            `{{sections.experience.items.${expIndex}.position}}`
          );
        }
        if (exp.duration) {
          template = template.replace(
            new RegExp(escapeRegex(exp.duration), 'g'),
            `{{sections.experience.items.${expIndex}.duration}}`
          );
        }

        // Replace bullets
        if (exp.bullets) {
          exp.bullets.forEach((bullet, bulletIndex) => {
            if (bullet.content) {
              template = template.replace(
                new RegExp(escapeRegex(bullet.content), 'g'),
                `{{sections.experience.items.${expIndex}.bullets.${bulletIndex}.content}}`
              );
            }
          });
        }
      });
    }

    // Projects section
    if (sections.projects?.items) {
      sections.projects.items.forEach((proj, projIndex) => {
        if (proj.name) {
          template = template.replace(
            new RegExp(escapeRegex(proj.name), 'g'),
            `{{sections.projects.items.${projIndex}.name}}`
          );
        }
        if (proj.description) {
          template = template.replace(
            new RegExp(escapeRegex(proj.description), 'g'),
            `{{sections.projects.items.${projIndex}.description}}`
          );
        }
        if (proj.bullets) {
          proj.bullets.forEach((bullet, bulletIndex) => {
            if (bullet.content) {
              template = template.replace(
                new RegExp(escapeRegex(bullet.content), 'g'),
                `{{sections.projects.items.${projIndex}.bullets.${bulletIndex}.content}}`
              );
            }
          });
        }
      });
    }

    // Education section
    if (sections.education?.items) {
      sections.education.items.forEach((edu, eduIndex) => {
        if (edu.institution) {
          template = template.replace(
            new RegExp(escapeRegex(edu.institution), 'g'),
            `{{sections.education.items.${eduIndex}.institution}}`
          );
        }
        if (edu.degree) {
          template = template.replace(
            new RegExp(escapeRegex(edu.degree), 'g'),
            `{{sections.education.items.${eduIndex}.degree}}`
          );
        }
        if (edu.field) {
          template = template.replace(
            new RegExp(escapeRegex(edu.field), 'g'),
            `{{sections.education.items.${eduIndex}.field}}`
          );
        }
        if (edu.graduationYear) {
          template = template.replace(
            new RegExp(escapeRegex(edu.graduationYear), 'g'),
            `{{sections.education.items.${eduIndex}.graduationYear}}`
          );
        }
      });
    }

    // Certifications section
    if (sections.certifications?.items) {
      sections.certifications.items.forEach((cert, certIndex) => {
        if (cert.name) {
          template = template.replace(
            new RegExp(escapeRegex(cert.name), 'g'),
            `{{sections.certifications.items.${certIndex}.name}}`
          );
        }
        if (cert.issuer) {
          template = template.replace(
            new RegExp(escapeRegex(cert.issuer), 'g'),
            `{{sections.certifications.items.${certIndex}.issuer}}`
          );
        }
        if (cert.date) {
          template = template.replace(
            new RegExp(escapeRegex(cert.date), 'g'),
            `{{sections.certifications.items.${certIndex}.date}}`
          );
        }
      });
    }

    // Validate template
    const validation = validateTemplate(template);
    if (!validation.isValid) {
      console.warn('⚠️ Template validation warnings:', validation.errors);
    }

    console.log('✅ Template conversion successful');
    return template;
  } catch (error) {
    console.error('❌ Template conversion error:', error.message);
    throw error;
  }
}

/**
 * Validate Handlebars template syntax
 * 
 * @param {string} template - Handlebars template string
 * @returns {Object} - { isValid: boolean, errors: string[] }
 */
function validateTemplate(template) {
  const errors = [];

  if (!template || template.trim().length === 0) {
    errors.push('Template cannot be empty');
    return { isValid: false, errors };
  }

  // Check for balanced braces in Handlebars expressions
  const handlebarsRegex = /\{\{[^}]*\}\}/g;
  const matches = template.match(handlebarsRegex) || [];

  matches.forEach((match) => {
    // Check for balanced braces
    const openCount = (match.match(/\{/g) || []).length;
    const closeCount = (match.match(/\}/g) || []).length;
    if (openCount !== closeCount) {
      errors.push(`Unbalanced braces in: ${match}`);
    }
  });

  // Check for LaTeX document structure
  if (!template.includes('\\documentclass')) {
    errors.push('Missing \\documentclass');
  }
  if (!template.includes('\\begin{document}')) {
    errors.push('Missing \\begin{document}');
  }
  if (!template.includes('\\end{document}')) {
    errors.push('Missing \\end{document}');
  }

  // Check for balanced LaTeX environments
  const envRegex = /\\begin\{(\w+)\}/g;
  const environments = [];
  let match;
  while ((match = envRegex.exec(template)) !== null) {
    const env = match[1];
    const endPattern = new RegExp(`\\\\end\\{${env}\\}`);
    if (!endPattern.test(template)) {
      errors.push(`Missing \\end{${env}} for \\begin{${env}}`);
    }
    environments.push(env);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Escape special regex characters
 * 
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  extractJsonFromLatex,
  convertLatexToTemplate,
  validateTemplate
};
