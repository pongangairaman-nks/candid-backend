/**
 * Iterative Optimization Service
 * 
 * Handles:
 * 1. Iteratively optimizing resume until 85+ ATS score
 * 2. Max 3 iterations with early exit if score >= 85
 * 3. Plateau detection (stop if improvement < 2%)
 * 4. Tracking optimization history
 */

import { analyzeResumeWithDiagnostic } from './atsAnalysisCombinedService.js';
import { optimizeWeakSectionsV2 } from './weakSectionOptimizationService.js';

/**
 * Iteratively optimize resume until target score is reached
 * 
 * Flow:
 * 1. Iteration 1: Analyze → If score >= 85: STOP
 * 2. Iteration 2: Optimize + Analyze → If score >= 85: STOP
 * 3. Iteration 3: Optimize + Analyze → STOP (max reached)
 * 
 * @param {Object} resumeContentJson - Initial resume content JSON
 * @param {string} jobDescription - Raw job description
 * @param {Object} userConfig - User's LLM config
 * @param {number} targetScore - Target ATS score (default: 85)
 * @param {number} maxIterations - Max iterations (default: 3)
 * @returns {Promise<Object>} - Optimized content, final score, iterations, history
 */
async function optimizeUntilTarget(
  resumeContentJson,
  jobDescription,
  userConfig,
  targetScore = 85,
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
      atsAnalysis = await analyzeResumeWithDiagnostic(
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

    // Step 3: Check for plateau (score not improving) - use trend analysis to avoid LLM variance
    if (iteration >= 3) {
      // Get last 2 scores for trend analysis
      const score2 = optimizationHistory[iteration - 2].score;  // 2 iterations ago
      const score1 = optimizationHistory[iteration - 1].score;  // 1 iteration ago
      const score0 = currentScore;                               // current
      
      // Calculate average improvement over last 2 iterations
      const improvement1 = score1 - score2;
      const improvement2 = score0 - score1;
      const avgImprovement = (improvement1 + improvement2) / 2;
      
      console.log(`  📊 Score trend: ${score2} → ${score1} → ${score0}`);
      console.log(`  📊 Improvements: +${improvement1}, +${improvement2} (avg: +${avgImprovement.toFixed(1)})`);

      // Only stop if trend shows plateau (avg improvement < 1 point over last 2 iterations)
      if (avgImprovement < 1) {
        console.log(`\n⚠️ Score plateau detected (avg improvement: ${avgImprovement.toFixed(1)} points). Stopping optimization.`);
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

    // Step 4: Optimize weak sections
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
  console.log(`\n Max iterations (${maxIterations}) reached.`);
  console.log(`   Final Score: ${currentScore}/100`);
  console.log(`   Target Score: ${targetScore}/100`);
  console.log(`   Gap: ${targetScore - currentScore} points`);
  console.log(`${'='.repeat(60)}\n`);

  // Analyze why we couldn't reach target
  const scoreGap = targetScore - currentScore;
  const improvementTrend = optimizationHistory.length > 1 
    ? optimizationHistory[optimizationHistory.length - 1].score - optimizationHistory[0].score
    : 0;

  let recommendation = '';
  if (scoreGap > 10) {
    recommendation = 'Resume has significant gaps. Consider adding more relevant skills, keywords, and quantifiable achievements that match the job description.';
  } else if (scoreGap > 5) {
    recommendation = 'Resume is close to target. Minor improvements in keyword integration and achievement descriptions could help reach the target score.';
  } else {
    recommendation = 'Resume is very close to target. The remaining gap may require manual fine-tuning or additional relevant experience.';
  }

  console.log(`📋 Recommendation: ${recommendation}\n`);

  return {
    optimized_content_json: currentContent,
    final_ats_score: currentScore,
    iterations: iteration,
    target_reached: currentScore >= targetScore,
    max_iterations_reached: true,
    optimization_history: optimizationHistory,
    scoreGap: scoreGap,
    improvementTrend: improvementTrend,
    recommendation: recommendation
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
