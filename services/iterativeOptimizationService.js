/**
 * Iterative Optimization Service
 * 
 * Handles:
 * 1. Iteratively optimizing resume until 80-90+ ATS score
 * 2. Max 3 iterations with early exit if score >= 80
 * 3. Plateau detection (stop if improvement < 2%)
 * 4. Tracking optimization history
 */

import { analyzeResumeWithLLM } from './atsAnalysisV2Service.js';
import { optimizeWeakSectionsV2 } from './weakSectionOptimizationService.js';

/**
 * Iteratively optimize resume until target score is reached
 * 
 * Flow:
 * 1. Iteration 1: Analyze → If score >= 80: STOP
 * 2. Iteration 2: Optimize + Analyze → If score >= 80: STOP
 * 3. Iteration 3: Optimize + Analyze → STOP (max reached)
 * 
 * @param {Object} resumeContentJson - Initial resume content JSON
 * @param {string} jobDescription - Raw job description
 * @param {Object} userConfig - User's LLM config
 * @param {number} targetScore - Target ATS score (default: 90)
 * @param {number} maxIterations - Max iterations (default: 3)
 * @returns {Promise<Object>} - Optimized content, final score, iterations, history
 */
async function optimizeUntilTarget(
  resumeContentJson,
  jobDescription,
  userConfig,
  targetScore = 90,
  maxIterations = 3
) {
  if (!resumeContentJson) {
    throw new Error('Resume content JSON is required');
  }

  if (!jobDescription || jobDescription.trim().length === 0) {
    throw new Error('Job description is required');
  }

  if (!userConfig || !userConfig.apiKey) {
    throw new Error('User LLM config is required');
  }

  let currentContent = JSON.parse(JSON.stringify(resumeContentJson)); // Deep copy
  let currentScore = 0;
  let iteration = 0;
  const optimizationHistory = [];

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Starting iterative optimization`);
  console.log(`   Target Score: ${targetScore}+`);
  console.log(`   Max Iterations: ${maxIterations}`);
  console.log(`${'='.repeat(60)}\n`);

  while (iteration < maxIterations) {
    iteration++;
    console.log(`\n📊 Iteration ${iteration}/${maxIterations}`);
    console.log(`${'='.repeat(40)}`);

    // Step 1: Analyze current resume
    console.log(`  1️⃣ Analyzing resume...`);
    let atsAnalysis;
    try {
      atsAnalysis = await analyzeResumeWithLLM(
        jobDescription,
        currentContent,
        userConfig
      );
    } catch (error) {
      console.error(`  ❌ Analysis failed:`, error.message);
      throw error;
    }

    currentScore = atsAnalysis.ats_score;
    console.log(`  📈 Current ATS Score: ${currentScore}/100`);

    // Store iteration history
    optimizationHistory.push({
      iteration,
      score: currentScore,
      weak_sections: atsAnalysis.weak_sections ? atsAnalysis.weak_sections.length : 0,
      timestamp: new Date().toISOString()
    });

    // Step 2: Check if target reached
    if (currentScore >= targetScore) {
      console.log(`\n✅ Target score reached! (${currentScore}/100)`);
      console.log(`${'='.repeat(60)}\n`);
      return {
        optimized_content_json: currentContent,
        final_ats_score: currentScore,
        iterations: iteration,
        target_reached: true,
        optimization_history: optimizationHistory
      };
    }

    // Step 3: Check for plateau (score not improving)
    if (iteration > 1) {
      const previousScore = optimizationHistory[iteration - 2].score;
      const improvement = currentScore - previousScore;

      console.log(`  📊 Improvement from last iteration: ${improvement}%`);

      if (improvement < 2) {
        console.log(`\n⚠️ Score plateau detected (improvement: ${improvement}%). Stopping optimization.`);
        console.log(`${'='.repeat(60)}\n`);
        return {
          optimized_content_json: currentContent,
          final_ats_score: currentScore,
          iterations: iteration,
          target_reached: false,
          plateau_detected: true,
          optimization_history: optimizationHistory
        };
      }
    }

    // Step 4: Check if we've reached 80+ on first iteration (early exit)
    if (iteration === 1 && currentScore >= 80) {
      console.log(`\n✅ Score >= 80 on first iteration. Stopping optimization.`);
      console.log(`${'='.repeat(60)}\n`);
      return {
        optimized_content_json: currentContent,
        final_ats_score: currentScore,
        iterations: iteration,
        target_reached: false,
        early_exit: true,
        optimization_history: optimizationHistory
      };
    }

    // Step 5: Optimize weak sections
    if (!atsAnalysis.weak_sections || atsAnalysis.weak_sections.length === 0) {
      console.log(`\n✅ No weak sections found. Resume is well-optimized.`);
      console.log(`${'='.repeat(60)}\n`);
      return {
        optimized_content_json: currentContent,
        final_ats_score: currentScore,
        iterations: iteration,
        target_reached: currentScore >= targetScore,
        optimization_history: optimizationHistory
      };
    }

    console.log(`  2️⃣ Optimizing ${atsAnalysis.weak_sections.length} weak sections...`);

    try {
      const optimizedContent = await optimizeWeakSectionsV2(
        currentContent,
        atsAnalysis,
        jobDescription,
        userConfig,
        iteration
      );

      currentContent = optimizedContent;
      console.log(`  ✅ Optimization complete for iteration ${iteration}`);
    } catch (error) {
      console.error(`  ❌ Optimization failed:`, error.message);
      throw error;
    }
  }

  // Max iterations reached
  console.log(`\n⚠️ Max iterations (${maxIterations}) reached.`);
  console.log(`   Final Score: ${currentScore}/100`);
  console.log(`${'='.repeat(60)}\n`);

  return {
    optimized_content_json: currentContent,
    final_ats_score: currentScore,
    iterations: iteration,
    target_reached: currentScore >= targetScore,
    max_iterations_reached: true,
    optimization_history: optimizationHistory
  };
}

/**
 * Get optimization summary
 * Useful for logging and debugging
 * 
 * @param {Object} result - Result from optimizeUntilTarget
 * @returns {Object} - Summary statistics
 */
function getOptimizationSummary(result) {
  const history = result.optimization_history || [];
  const initialScore = history.length > 0 ? history[0].score : 0;
  const finalScore = result.final_ats_score;
  const totalImprovement = finalScore - initialScore;

  return {
    initial_score: initialScore,
    final_score: finalScore,
    total_improvement: totalImprovement,
    improvement_percentage: initialScore > 0 ? ((totalImprovement / initialScore) * 100).toFixed(2) : 0,
    iterations: result.iterations,
    target_reached: result.target_reached,
    plateau_detected: result.plateau_detected || false,
    early_exit: result.early_exit || false,
    max_iterations_reached: result.max_iterations_reached || false,
    history: history
  };
}

export {
  optimizeUntilTarget,
  getOptimizationSummary
};
