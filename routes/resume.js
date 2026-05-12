import express from "express";
import pool from "../config/database.js";
import { optimizeSectionWithClaude } from "../services/claudeService.js";
import { optimizeSectionWithGemini } from "../services/geminiService.js";
import { optimizeSectionWithOpenAI } from "../services/openaiService.js";
import { authenticateToken } from "../middleware/auth.js";
import { getUserLLMConfig } from "./llmConfig.js";
import { getTieredLLMConfig } from "../services/llmTierService.js";
import { getUserFeatureFlags } from "../services/featureFlags.js";
import { logLLMOperation, logger } from "../services/logger.js";
import { optimizeLimiter } from "../middleware/rateLimiter.js";
import {
  extractSectionsFromLatex,
  formatSectionsForResponse,
} from "../utils/sectionParser.js";
import { extractJsonFromLatex, convertLatexToTemplate } from "../services/resumeParserService.js";
import { logTokenUsage } from "../services/tokenTrackingService.js";

const router = express.Router();

// POST /api/resume/save-master-template - Save master resume template
// Extracts JSON and template from LaTeX using LLM
router.post("/save-master-template", authenticateToken, async (req, res) => {
  try {
    const { latexCode } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!latexCode || !latexCode.trim()) {
      return res.status(400).json({
        status: "error",
        message: "LaTeX code is required",
      });
    }

    console.log(`📄 Processing master template for user ${userId}`);

    // Get user's LLM config or use environment defaults
    let userConfig;
    try {
      userConfig = await getUserLLMConfig(userId, 'generator');
      console.log(`✅ User LLM config retrieved:`, userConfig?.provider);
    } catch (configError) {
      console.error(`❌ Error getting LLM config:`, configError.message);
    }

    // Fallback to environment variables if no user config
    if (!userConfig) {
      console.log(`⚠️ No user LLM config found, using environment defaults`);
      userConfig = {
        provider: process.env.LLM_PROVIDER || 'claude',
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-latest',
        apiKey: process.env.CLAUDE_API_KEY,
      };
    }

    if (!userConfig.apiKey) {
      return res.status(400).json({
        status: "error",
        message: "LLM API key not configured. Please set up your LLM settings.",
      });
    }

    // Extract JSON from LaTeX using LLM
    let extractedJson;
    try {
      console.log(`🔍 Extracting JSON from LaTeX...`);
      extractedJson = await extractJsonFromLatex(latexCode, userConfig);
      console.log(`✅ JSON extracted successfully`);
    } catch (extractError) {
      console.error(`❌ Error extracting JSON:`, extractError.message);
      return res.status(400).json({
        status: "error",
        message: "Failed to extract resume content from LaTeX",
        error: process.env.NODE_ENV === "development" ? extractError.message : undefined,
      });
    }

    if (!extractedJson) {
      return res.status(400).json({
        status: "error",
        message: "Failed to extract resume content from LaTeX - no data returned",
      });
    }

    // Convert LaTeX to Handlebars template
    let template;
    try {
      console.log(`📝 Creating Handlebars template...`);
      template = await convertLatexToTemplate(latexCode, userConfig);
      console.log(`✅ Template created successfully`);
    } catch (templateError) {
      console.error(`❌ Error creating template:`, templateError.message);
      return res.status(400).json({
        status: "error",
        message: "Failed to create template from LaTeX",
        error: process.env.NODE_ENV === "development" ? templateError.message : undefined,
      });
    }

    if (!template) {
      return res.status(400).json({
        status: "error",
        message: "Failed to create template from LaTeX - no data returned",
      });
    }

    // Check if user already has a master template
    let existingTemplate;
    try {
      existingTemplate = await pool.query(
        "SELECT id FROM resumes WHERE user_id = $1 AND id = (SELECT MIN(id) FROM resumes WHERE user_id = $1)",
        [userId],
      );
      console.log(`✅ Checked for existing template: ${existingTemplate.rows?.length > 0 ? 'Found' : 'Not found'}`);
    } catch (dbError) {
      console.error(`❌ Error checking existing template:`, dbError.message);
      return res.status(500).json({
        status: "error",
        message: "Database error while checking existing template",
        error: process.env.NODE_ENV === "development" ? dbError.message : undefined,
      });
    }

    let result;
    try {
      if (existingTemplate.rows?.length > 0) {
        console.log(`📝 Updating existing template...`);
        // Update existing master template
        result = await pool.query(
          `UPDATE resumes 
           SET original_latex = $1, 
               master_resume_text = $2, 
               extracted_content_json = $3,
               created_latex_template = $4,
               updated_at = NOW()
           WHERE user_id = $5 AND id = $6
           RETURNING id, original_latex, extracted_content_json, created_latex_template, updated_at`,
          [latexCode, latexCode, JSON.stringify(extractedJson), template, userId, existingTemplate.rows?.[0]?.id],
        );
      } else {
        console.log(`📝 Creating new template...`);
        // Create new master template
        result = await pool.query(
          `INSERT INTO resumes (user_id, original_latex, master_resume_text, extracted_content_json, created_latex_template, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           RETURNING id, original_latex, extracted_content_json, created_latex_template, created_at`,
          [userId, latexCode, latexCode, JSON.stringify(extractedJson), template],
        );
      }
      console.log(`✅ Database operation successful`);
    } catch (dbError) {
      console.error(`❌ Error saving template to database:`, dbError.message);
      return res.status(500).json({
        status: "error",
        message: "Failed to save master template to database",
        error: process.env.NODE_ENV === "development" ? dbError.message : undefined,
      });
    }

    if (result.rows?.length === 0) {
      console.error(`❌ No rows returned from database operation`);
      return res.status(500).json({
        status: "error",
        message: "Failed to save master template - no data returned",
      });
    }

    const savedTemplate = result.rows?.[0];
    const savedJson = typeof savedTemplate.extracted_content_json === 'string' 
      ? JSON.parse(savedTemplate.extracted_content_json) 
      : savedTemplate.extracted_content_json;

    // Log token usage if available
    try {
      if (userConfig.model) {
        await logTokenUsage(userId, 'extraction', userConfig.model, 0, 0);
        console.log(`✅ Token usage logged`);
      }
    } catch (logError) {
      console.warn(`⚠️ Failed to log token usage:`, logError.message);
    }

    res.status(200).json({
      status: "success",
      message: "Master template saved successfully with extracted content",
      data: {
        templateId: savedTemplate.id,
        originalLatex: savedTemplate.original_latex,
        extractedJson: savedJson,
        latexTemplate: savedTemplate.created_latex_template,
        savedAt: savedTemplate.updated_at || savedTemplate.created_at,
      },
    });
  } catch (error) {
    console.error("Save master template error:", error.message);
    res.status(500).json({
      status: "error",
      message: "Failed to save master template",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// GET /api/resume/master-template - Get master resume template with extracted JSON and Handlebars template
router.get("/master-template", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    console.log(`📄 Fetching master template for user ${userId}`);

    const result = await pool.query(
      `SELECT id, original_latex, extracted_content_json, created_latex_template, created_at, updated_at 
       FROM resumes 
       WHERE user_id = $1 
       ORDER BY id ASC 
       LIMIT 1`,
      [userId],
    );

    if (result.rows?.length === 0) {
      console.log(`⚠️ No master template found for user ${userId}`);
      return res.status(200).json({
        status: "success",
        data: {
          templateId: null,
          originalLatex: "",
          extractedJson: null,
          handlebarsTemplate: "",
        },
      });
    }

    const template = result.rows[0];
    const extractedJson = typeof template.extracted_content_json === 'string'
      ? JSON.parse(template.extracted_content_json)
      : template.extracted_content_json;

    console.log(
      `✅ Master template found for user ${userId}`,
    );

    res.status(200).json({
      status: "success",
      data: {
        templateId: template.id,
        originalLatex: template.original_latex,
        extractedJson: extractedJson,
        handlebarsTemplate: template.created_latex_template,
        createdAt: template.created_at,
        updatedAt: template.updated_at,
      },
    });
  } catch (error) {
    console.error("❌ Get master template error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch master template",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// GET /api/resume/sections - Get sections from user's master resume (extracted JSON)
router.get("/sections", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    console.log(`📋 Fetching sections for user ${userId}`);

    const result = await pool.query(
      `SELECT extracted_content_json 
       FROM resumes 
       WHERE user_id = $1 
       ORDER BY id ASC 
       LIMIT 1`,
      [userId],
    );

    if (result.rows?.length === 0) {
      console.log(`⚠️ No resume found for user ${userId}`);
      return res.status(200).json({
        status: "success",
        data: {
          sections: {},
        },
      });
    }

    const extractedJson = typeof result.rows[0].extracted_content_json === 'string'
      ? JSON.parse(result.rows[0].extracted_content_json)
      : result.rows[0].extracted_content_json;

    console.log(`✅ Found sections for user ${userId}`);

    res.status(200).json({
      status: "success",
      data: {
        sections: extractedJson?.sections || {},
      },
    });
  } catch (error) {
    console.error("❌ Get sections error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch sections",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// POST /api/resume/save-master-cover-letter-template - Save master cover letter template
router.post(
  "/save-master-cover-letter-template",
  authenticateToken,
  async (req, res) => {
    try {
      const { latexCode } = req.body;
      const userId = req.user.id;

      // Validate input
      if (!latexCode || !latexCode.trim()) {
        return res.status(400).json({
          status: "error",
          message: "LaTeX code is required",
        });
      }

      // Check if user already has a master cover letter template
      const existingTemplate = await pool.query(
        "SELECT id FROM cover_letters WHERE user_id = $1 ORDER BY id ASC LIMIT 1",
        [userId],
      );

      let result;
      if (existingTemplate.rows?.length > 0) {
        // Update existing master cover letter template
        result = await pool.query(
          `UPDATE cover_letters 
         SET original_latex = $1, master_cover_letter_text = $2, updated_at = NOW()
         WHERE user_id = $3 AND id = $4
         RETURNING id, original_latex, updated_at`,
          [latexCode, latexCode, userId, existingTemplate.rows?.[0]?.id],
        );
      } else {
        // Create new master cover letter template
        result = await pool.query(
          `INSERT INTO cover_letters (user_id, original_latex, master_cover_letter_text, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         RETURNING id, original_latex, created_at`,
          [userId, latexCode, latexCode],
        );
      }

      if (result.rows?.length === 0) {
        return res.status(500).json({
          status: "error",
          message: "Failed to save master cover letter template",
        });
      }

      const template = result.rows?.[0];

      res.status(200).json({
        status: "success",
        message: "Master cover letter template saved successfully",
        data: {
          templateId: template.id,
          saved_at: template.updated_at || template.created_at,
        },
      });
    } catch (error) {
      console.error("Save master cover letter template error:", error.message);
      res.status(500).json({
        status: "error",
        message: "Failed to save master cover letter template",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },
);

// GET /api/resume/master-cover-letter-template - Get master cover letter template
router.get(
  "/master-cover-letter-template",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.id;

      console.log(
        `📄 Fetching master cover letter template for user ${userId}`,
      );

      const result = await pool.query(
        `SELECT id, original_latex, created_at, updated_at 
       FROM cover_letters 
       WHERE user_id = $1
       ORDER BY id ASC
       LIMIT 1`,
        [userId],
      );

      if (result.rows?.length === 0) {
        console.log(
          `⚠️ No master cover letter template found for user ${userId}, returning empty`,
        );
        return res.status(200).json({
          status: "success",
          data: {
            templateId: null,
            latexCode: "",
          },
        });
      }

      const template = result.rows?.[0];

      console.log(`✅ Master cover letter template found for user ${userId}`);

      res.status(200).json({
        status: "success",
        data: {
          templateId: template.id,
          latexCode: template.original_latex,
          createdAt: template.created_at,
          updatedAt: template.updated_at,
        },
      });
    } catch (error) {
      console.error("❌ Get master cover letter template error:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to fetch master cover letter template",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },
);

// POST /api/resume/optimize - Optimize a section of resume with quality toggle
router.post(
  "/optimize",
  authenticateToken,
  optimizeLimiter,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const startTime = Date.now();
      const {
        jobDescription,
        prompt,
        masterProfile,
        extractedContentJson,
        resume,
        quality = "high",
        mode = "global",
        section,
        selectedContent,
        primarySection,
        allSections,
        confidence,
      } = req.body;

      // Validate input - prefer extractedContentJson over resume
      if (!extractedContentJson && !resume) {
        return res.status(400).json({
          status: "error",
          message: "Either extractedContentJson or resume text is required",
        });
      }

      if (!jobDescription || !jobDescription.trim()) {
        return res.status(400).json({
          status: "error",
          message: "Job description is required",
        });
      }

      // Validate quality param
      if (!["fast", "high"].includes(quality)) {
        return res.status(400).json({
          status: "error",
          message: 'Quality must be either "fast" or "high"',
        });
      }

      // Validate mode
      if (!["global", "focused"].includes(mode)) {
        return res.status(400).json({
          status: "error",
          message: 'Mode must be either "global" or "focused"',
        });
      }

      const optimizationGuidelines = `Follow these directives to transform the provided LaTeX resume into an ATS-optimized version while keeping it production-ready and identical in scope:

CRITICAL CONSTRAINTS
- Strict content preservation: keep total wording within +/-5% of the source. Maintain the same section hierarchy, bullet counts, ordering, and approximate line usage. Do NOT merge, split, add, or remove bullets or sentences unless the original content is empty or duplicated.
- Structured content usage: reference any master profile data only to refine existing sentences—never to expand or create new sections.
- No fabrication: do NOT invent new achievements, metrics, tools, responsibilities, or experiences. Only enhance wording for what already exists.
- Safe LaTeX only: use stable commands already present (\\textbf{}, \\section{}, \\begin{itemize}...\\end{itemize}, basic spacing like \\ or \\vspace). NEVER introduce fragile primitives such as \\hbox, \\vbox, \\raise, \\lower, or \\kern, and do not add custom macros, new packages, or layout changes.
- Minimal transformation: treat this as precise optimization, not rewriting. Preserve original meaning, intent, and density in every sentence.
- One-page guarantee: the output must preserve the single-page layout. Avoid changes that expand spacing or push content beyond one page.

OBJECTIVES
- Keyword integration: weave relevant skills, tools, and phrases from the job description naturally into existing sentences without keyword stuffing or altering factual accuracy.
- Bullet articulation: strengthen bullet phrasing with clear action verbs (Built, Led, Designed, Optimized, Scaled, Delivered) while keeping each bullet within one to two lines and retaining all substantive details.
- Relevance alignment: adjust emphasis inside bullets to reflect the job description, but keep every bullet present.
- Clarity & conciseness: remove redundancy only when total content volume remains the same. Improve readability and flow without shortening the document.
- ATS compatibility: favor plain text, avoid inline math or unusual symbols, and keep formatting clean for parsing.

OUTPUT FORMAT
- Return RAW LaTeX text only—no explanations, markdown, comments, or code fences. Do NOT wrap the response in triple backticks.
- Preserve the existing document class, preamble, spacing commands, and packages exactly as provided.
- Ensure the result compiles in minimal pdflatex environments without fragile constructs.
- Maintain substantive coverage: when tightening phrasing, redistribute essential keywords so overall coverage matches the source.
- Avoid special characters that require new packages and keep leading/trailing blank lines consistent with the input.

Only rewrite existing sentences to improve clarity and ATS alignment while preserving the original content volume.`;

      // Use default prompt if not provided
      const optimizationPrompt =
        prompt && prompt.trim()
          ? `${prompt.trim()}

${optimizationGuidelines}`
          : optimizationGuidelines;

      // Get feature flags and user config
      const flags = await getUserFeatureFlags(userId);
      const userConfig = await getTieredLLMConfig(
        userId,
        "generator",
        quality === "fast" ? "section_optimize_fast" : "section_optimize_high",
      );
      console.log("userConfig", userConfig);
      if (!userConfig) {
        return res.status(400).json({
          status: "error",
          message:
            "LLM configuration not found. Please configure your LLM provider in the Configuration page.",
        });
      }

      logger.info(
        `🔧 Using generator: ${userConfig.provider} - ${userConfig.model} (${quality} mode, tier: ${userConfig.tier})`,
      );

      // Convert masterProfile to string if it's an array (filter out empty sections)
      let masterProfileLatex = "";
      if (masterProfile) {
        if (Array.isArray(masterProfile)) {
          // Filter sections with content and convert to readable format for LLM context
          const nonEmptySections = masterProfile.filter(
            (section) => section.content && section.content.trim(),
          );

          if (nonEmptySections.length > 0) {
            masterProfileLatex = nonEmptySections
              .map((section) => `${section.title}:\n${section.content}`)
              .join("\n\n---\n\n");
            console.log(
              `📋 Filtered ${nonEmptySections.length} non-empty sections from masterProfile`,
            );
          } else {
            console.log(
              `📋 No non-empty sections in masterProfile, will use resume only`,
            );
          }
        } else if (typeof masterProfile === "string") {
          masterProfileLatex = masterProfile;
        }
      }

      // Handle JSON optimization if extractedContentJson is provided
      if (extractedContentJson) {
        console.log('📊 Optimizing extracted JSON against job description...');
        
        // Use the iterative optimization service to optimize the JSON
        const { optimizeUntilTarget } = await import('../services/iterativeOptimizationService.js');
        
        const optimizationResult = await optimizeUntilTarget(
          extractedContentJson,
          jobDescription,
          userConfig,
          85, // target score - must reach 85+
        );

        logger.info(`✅ JSON optimization complete (Score: ${optimizationResult.final_ats_score}/100)`);

        // Save optimized JSON to database for this resume
        try {
          await pool.query(
            `UPDATE resumes 
             SET extracted_content_json = $1, updated_at = NOW()
             WHERE user_id = $2`,
            [JSON.stringify(optimizationResult.optimized_content_json), userId]
          );
          console.log('💾 Optimized JSON saved to database');
        } catch (dbError) {
          console.warn('⚠️ Failed to save optimized JSON to database:', dbError.message);
        }

        res.status(200).json({
          status: "success",
          message: "Resume optimization successful",
          data: {
            optimizedJson: optimizationResult.optimized_content_json,
            atsScore: optimizationResult.final_ats_score,
            iterations: optimizationResult.iterations,
            targetReached: optimizationResult.target_reached,
            latencyMs: Date.now() - startTime,
          },
        });
        return;
      }

      let fullLatex = resume;
      let contextSize = resume?.length || 0;
      let optimizationContext = "";

      // Handle focused mode (section selection)
      if (mode === "focused" && selectedContent && primarySection) {
        logger.info(
          `📍 FOCUSED MODE: Optimizing section "${primarySection}" (confidence: ${confidence}%)`,
        );

        // For focused mode, include section-specific context
        if (quality === "high") {
          fullLatex = masterProfileLatex || resume;
          logger.info(
            "📊 Using full resume context for section optimization (high quality)...",
          );
        } else {
          // For fast mode, include only the selected content + section outline
          if (masterProfileLatex) {
            const sections =
              masterProfileLatex.match(/\\section\*?{[^}]+}/g) || [];
            const outline = sections?.join("\n") || "";
            fullLatex = `${selectedContent}\n\n% FULL RESUME OUTLINE:\n${outline}`;
          } else {
            fullLatex = selectedContent;
          }
          logger.info(
            "📊 Using focused context for section optimization (fast mode)...",
          );
        }

        // Build context string for LLM
        optimizationContext = `You are optimizing the "${primarySection}" section of a resume.

          SELECTED CONTENT TO OPTIMIZE:
          ${selectedContent}

          ${allSections && allSections.length > 1 ? `NOTE: Selection spans multiple sections: ${allSections.join(", ")}` : ""}

          CONTEXT: Full resume structure and job description provided below.

${optimizationGuidelines}`;

        contextSize = fullLatex?.length || 0;
      } else {
        // Global mode (full resume optimization)
        logger.info("🌍 GLOBAL MODE: Optimizing entire resume");

        if (quality === "high") {
          fullLatex = masterProfileLatex || resume;
          logger.info(
            "📊 Optimizing with full resume context (high quality)...",
          );
        } else {
          logger.info("📊 Optimizing with reduced context (fast mode)...");
          if (masterProfileLatex) {
            const sections =
              masterProfileLatex.match(/\\section\*?{[^}]+}/g) || [];
            const outline = sections?.join("\n") || "";
            fullLatex = `${resume}\n\n% SECTION OUTLINE:\n${outline}`;
          }
          contextSize = fullLatex?.length || 0;
        }

        optimizationContext = `Optimize the entire resume to better match the job description.

${optimizationGuidelines}`;
      }

      let optimizedText;

      // Call appropriate LLM service based on provider
      if (userConfig.provider === "claude") {
        optimizedText = await optimizeSectionWithClaude(
          mode === "focused" ? selectedContent : resume,
          fullLatex,
          jobDescription,
          optimizationContext || optimizationPrompt,
          userConfig,
        );
      } else if (userConfig.provider === "openai") {
        optimizedText = await optimizeSectionWithOpenAI(
          mode === "focused" ? selectedContent : resume,
          fullLatex,
          jobDescription,
          optimizationContext || optimizationPrompt,
          userConfig,
        );
      } else if (userConfig.provider === "gemini") {
        optimizedText = await optimizeSectionWithGemini(
          mode === "focused" ? selectedContent : resume,
          fullLatex,
          jobDescription,
          optimizationContext || optimizationPrompt,
          userConfig,
        );
      } else {
        return res.status(400).json({
          status: "error",
          message: "Unsupported LLM provider",
        });
      }

      // Log LLM operation
      const latency = Date.now() - startTime;
      logLLMOperation({
        userId,
        phase: `${mode}_optimize_${quality}`,
        provider: userConfig.provider,
        model: userConfig.model,
        latencyMs: latency,
        endpoint: "/api/resume/optimize",
        status: "success",
      });

      logger.info(`✅ Resume ${mode} optimization completed`);

      res.status(200).json({
        status: "success",
        message: `Resume ${mode} optimization successful`,
        data: {
          optimizedLatex: optimizedText,
          mode,
          section: primarySection,
          quality,
          contextSize,
          latencyMs: latency,
        },
      });
    } catch (error) {
      logger.error("Resume optimization error:", { error: error.message });

      // Extract meaningful error message from different error types
      let errorMessage = "Failed to optimize resume";
      let errorDetails = "";

      if (error.message && error.message.includes("credit balance")) {
        errorMessage = "API credit balance is too low";
        errorDetails =
          "Please upgrade your API plan to continue using optimization features.";
      } else if (error.message && error.message.includes("401")) {
        errorMessage = "API authentication failed";
        errorDetails =
          "Please check your API key configuration in the Configuration page.";
      } else if (error.message && error.message.includes("429")) {
        errorMessage = "API rate limit exceeded";
        errorDetails = "Please try again in a few moments.";
      } else if (error.message && error.message.includes("timeout")) {
        errorMessage = "Request timed out";
        errorDetails = "The optimization took too long. Please try again.";
      } else if (
        (error.message && error.message.includes("not_found_error")) ||
        error.message.includes("404")
      ) {
        const modelMatch = error.message.match(/model:\s*([^\s,}]+)/);
        const model = modelMatch ? modelMatch[1] : "unknown model";
        errorMessage = `Model not found: ${model}`;
        errorDetails = `The configured generator model "${model}" is not available. Please update your LLM configuration with a valid model name.`;
      } else if (error.message) {
        errorMessage = error.message;
      }

      res.status(500).json({
        status: "error",
        message: errorMessage,
        error:
          errorDetails ||
          (process.env.NODE_ENV === "development" ? error.message : undefined),
      });
    }
  },
);

export default router;
