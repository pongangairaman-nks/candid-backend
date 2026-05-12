/**
 * V2 Endpoints Testing Script
 * Tests all newly created V2 resume optimization endpoints
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:10000/api/v2';
const TEST_TOKEN = 'test-token'; // You'll need a valid auth token

// Sample test data
const sampleLatex = `\\documentclass{article}
\\usepackage[utf-8]{inputenc}
\\begin{document}

\\section*{John Doe}
john@example.com | +1-234-567-8900 | San Francisco, CA

\\section*{Professional Summary}
Senior Backend Engineer with 5+ years of experience building scalable distributed systems.

\\section*{Skills}
\\begin{itemize}
  \\item Backend: Node.js, Express, Python, Django
  \\item Databases: PostgreSQL, MongoDB, Redis
  \\item DevOps: Docker, Kubernetes, AWS
\\end{itemize}

\\section*{Experience}
\\subsection*{Senior Backend Engineer - Unacademy}
Jan 2021 - Present | Bangalore, India
\\begin{itemize}
  \\item Architected microservices platform handling 10M+ daily requests
  \\item Led team of 5 engineers to redesign payment system
  \\item Implemented distributed caching strategy using Redis
\\end{itemize}

\\section*{Education}
\\subsection*{Bachelor of Science in Computer Science}
University of California, Berkeley | 2019

\\end{document}`;

const sampleJobDescription = `We are looking for a Senior Backend Engineer with:
- 5+ years of experience with Node.js and microservices
- Strong knowledge of Kubernetes and Docker
- Experience with PostgreSQL and distributed systems
- AWS expertise
- Team leadership experience

Responsibilities:
- Design and implement scalable backend systems
- Lead technical architecture decisions
- Mentor junior engineers
- Optimize system performance`;

// Test functions
async function testUploadMaster() {
  console.log('\n📤 Testing POST /api/v2/resume/upload-master');
  console.log('='.repeat(60));

  try {
    const response = await fetch(`${BASE_URL}/resume/upload-master`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`
      },
      body: JSON.stringify({
        latexContent: sampleLatex
      })
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Upload Master: SUCCESS');
      console.log(`   Status: ${data.status}`);
      console.log(`   Message: ${data.message}`);
      if (data.data) {
        console.log(`   Resume ID: ${data.data.resumeId}`);
        console.log(`   Template extracted: ${data.data.created_latex_template ? 'Yes' : 'No'}`);
        console.log(`   JSON extracted: ${data.data.extracted_content_json ? 'Yes' : 'No'}`);
      }
      return true;
    } else {
      console.log('❌ Upload Master: FAILED');
      console.log(`   Status: ${response.status}`);
      console.log(`   Error: ${data.message}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Upload Master: ERROR');
    console.log(`   ${error.message}`);
    return false;
  }
}

async function testGetMaster() {
  console.log('\n📥 Testing GET /api/v2/resume/master');
  console.log('='.repeat(60));

  try {
    const response = await fetch(`${BASE_URL}/resume/master`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`
      }
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Get Master: SUCCESS');
      console.log(`   Status: ${data.status}`);
      console.log(`   Template available: ${data.data?.created_latex_template ? 'Yes' : 'No'}`);
      console.log(`   JSON available: ${data.data?.extracted_content_json ? 'Yes' : 'No'}`);
      return true;
    } else {
      console.log('❌ Get Master: FAILED');
      console.log(`   Status: ${response.status}`);
      console.log(`   Error: ${data.message}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Get Master: ERROR');
    console.log(`   ${error.message}`);
    return false;
  }
}

async function testAnalyze() {
  console.log('\n🔍 Testing POST /api/v2/resume/analyze');
  console.log('='.repeat(60));

  try {
    // First get the master resume
    const masterResponse = await fetch(`${BASE_URL}/resume/master`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`
      }
    });

    if (!masterResponse.ok) {
      console.log('⚠️  Analyze: SKIPPED (No master resume found)');
      return false;
    }

    const masterData = await masterResponse.json();
    const extractedJson = masterData.data?.extracted_content_json;

    if (!extractedJson) {
      console.log('⚠️  Analyze: SKIPPED (No extracted JSON)');
      return false;
    }

    const response = await fetch(`${BASE_URL}/resume/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`
      },
      body: JSON.stringify({
        jobDescription: sampleJobDescription,
        extractedContentJson: extractedJson
      })
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Analyze: SUCCESS');
      console.log(`   Status: ${data.status}`);
      console.log(`   ATS Score: ${data.data?.ats_score}/100`);
      console.log(`   Weak Sections: ${data.data?.weak_sections?.length || 0}`);
      console.log(`   Missing Keywords: ${data.data?.missing_keywords?.length || 0}`);
      return true;
    } else {
      console.log('❌ Analyze: FAILED');
      console.log(`   Status: ${response.status}`);
      console.log(`   Error: ${data.message}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Analyze: ERROR');
    console.log(`   ${error.message}`);
    return false;
  }
}

async function testOptimize() {
  console.log('\n🚀 Testing POST /api/v2/resume/optimize-to-target');
  console.log('='.repeat(60));

  try {
    // First get the master resume
    const masterResponse = await fetch(`${BASE_URL}/resume/master`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`
      }
    });

    if (!masterResponse.ok) {
      console.log('⚠️  Optimize: SKIPPED (No master resume found)');
      return false;
    }

    const masterData = await masterResponse.json();
    const extractedJson = masterData.data?.extracted_content_json;

    if (!extractedJson) {
      console.log('⚠️  Optimize: SKIPPED (No extracted JSON)');
      return false;
    }

    const response = await fetch(`${BASE_URL}/resume/optimize-to-target`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`
      },
      body: JSON.stringify({
        extractedContentJson: extractedJson,
        jobDescription: sampleJobDescription,
        targetScore: 90
      })
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Optimize: SUCCESS');
      console.log(`   Status: ${data.status}`);
      console.log(`   Final ATS Score: ${data.data?.final_ats_score}/100`);
      console.log(`   Iterations: ${data.data?.iterations}`);
      console.log(`   Target Reached: ${data.data?.target_reached ? 'Yes' : 'No'}`);
      console.log(`   Duration: ${data.data?.duration_seconds}s`);
      return true;
    } else {
      console.log('❌ Optimize: FAILED');
      console.log(`   Status: ${response.status}`);
      console.log(`   Error: ${data.message}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Optimize: ERROR');
    console.log(`   ${error.message}`);
    return false;
  }
}

async function testUsageStats() {
  console.log('\n📊 Testing GET /api/v2/usage/stats');
  console.log('='.repeat(60));

  try {
    const response = await fetch(`${BASE_URL}/usage/stats`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`
      }
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Usage Stats: SUCCESS');
      console.log(`   Status: ${data.status}`);
      console.log(`   Total Calls: ${data.data?.totals?.total_calls || 0}`);
      console.log(`   Total Cost: $${data.data?.totals?.total_cost_usd?.toFixed(4) || '0'}`);
      return true;
    } else {
      console.log('❌ Usage Stats: FAILED');
      console.log(`   Status: ${response.status}`);
      console.log(`   Error: ${data.message}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Usage Stats: ERROR');
    console.log(`   ${error.message}`);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 V2 ENDPOINTS TEST SUITE');
  console.log('='.repeat(60));

  const results = {
    uploadMaster: false,
    getMaster: false,
    analyze: false,
    optimize: false,
    usageStats: false
  };

  // Run tests in sequence
  results.uploadMaster = await testUploadMaster();
  results.getMaster = await testGetMaster();
  results.analyze = await testAnalyze();
  results.optimize = await testOptimize();
  results.usageStats = await testUsageStats();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;

  Object.entries(results).forEach(([test, result]) => {
    console.log(`${result ? '✅' : '❌'} ${test}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log(`Total: ${passed}/${total} tests passed`);
  console.log('='.repeat(60) + '\n');

  process.exit(passed === total ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});
