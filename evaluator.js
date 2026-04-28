/**
 * evaluator.js
 * Evaluation suite for the Mumzworld AI Support Pipeline
 * 14 test cases covering normal, edge, adversarial, and mixed-intent inputs
 *
 * Run: node evaluator.js
 */

require("dotenv").config();
const { runPipeline } = require("./ai_pipeline");

// ─── Test Cases ───────────────────────────────────────────────────────────────

const TEST_CASES = [
  // --- Normal Cases ---
  {
    id: "TC01",
    category: "normal",
    message: "I want refund, my order is delayed",
    expected_intent: "refund_request",
    expected_urgency: "high",
    expected_needs_human: false, // high confidence expected
    description: "Classic refund + delay combo",
  },
  {
    id: "TC02",
    category: "normal",
    message: "Where is my order? I placed it 5 days ago",
    expected_intent: "order_tracking",
    expected_urgency: "medium",
    expected_needs_human: false,
    description: "Order tracking request",
  },
  {
    id: "TC03",
    category: "normal",
    message: "Hello, I need some help",
    expected_intent: "greeting",
    expected_urgency: "low",
    expected_needs_human: false,
    description: "Simple greeting",
  },
  {
    id: "TC04",
    category: "normal",
    message: "Can I exchange the size of the dress I ordered? It doesn't fit",
    expected_intent: "exchange_request",
    expected_urgency: "low",
    expected_needs_human: false,
    description: "Exchange request with reason",
  },
  {
    id: "TC05",
    category: "normal",
    message: "I was charged twice for the same order. Please fix this immediately!",
    expected_intent: "complaint",
    expected_urgency: "high",
    expected_needs_human: true,
    description: "Double charge — high urgency complaint",
  },
  // --- Arabic Input ---
  {
    id: "TC06",
    category: "multilingual",
    message: "أريد استرداد أموالي، طلبي تأخر كثيراً",
    expected_intent: "refund_request",
    expected_urgency: "high",
    expected_needs_human: false,
    description: "Arabic refund request",
  },
  // --- Edge Cases ---
  {
    id: "TC07",
    category: "edge",
    message: "Hi",
    expected_intent: "greeting",
    expected_urgency: "low",
    expected_needs_human: false,
    description: "Minimal input — single word",
  },
  {
    id: "TC08",
    category: "edge",
    message: "It's an emergency, I need help right now with my payment and also my order never came and I want to return everything",
    expected_intent: "complaint",
    expected_urgency: "high",
    expected_needs_human: true,
    description: "Mixed intent — multiple issues",
  },
  {
    id: "TC09",
    category: "edge",
    message: "Is the baby stroller still available in blue color?",
    expected_intent: "product_query",
    expected_urgency: "low",
    expected_needs_human: false,
    description: "Product availability query",
  },
  // --- Adversarial / Gibberish ---
  {
    id: "TC10",
    category: "adversarial",
    message: "asdasdasd",
    expected_intent: "unknown",
    expected_urgency: "low",
    expected_needs_human: true,
    description: "Gibberish input",
  },
  {
    id: "TC11",
    category: "adversarial",
    message: "!!!???###",
    expected_intent: "unknown",
    expected_urgency: "low",
    expected_needs_human: true,
    description: "Special characters only",
  },
  {
    id: "TC12",
    category: "adversarial",
    message: "I am SO angry. This is the WORST service I have ever experienced. Absolutely unacceptable!!!",
    expected_intent: "complaint",
    expected_urgency: "high",
    expected_needs_human: true,
    description: "Angry tone — extreme urgency",
  },
  // --- Uncertain / Unclear ---
  {
    id: "TC13",
    category: "uncertain",
    message: "I don't know what happened but something is wrong",
    expected_intent: "complaint",
    expected_urgency: "medium",
    expected_needs_human: true,
    description: "Vague complaint — should trigger low confidence",
  },
  {
    id: "TC14",
    category: "uncertain",
    message: "Can you help me with something?",
    expected_intent: "unknown",
    expected_urgency: "low",
    expected_needs_human: true,
    description: "Extremely vague — intent unclear",
  },
];

// ─── Evaluation Logic ─────────────────────────────────────────────────────────

function evaluateResult(testCase, result) {
  const issues = [];
  const data = result.data;

  // Check JSON validity
  if (!result.success && result.pipeline_steps?.validation?.errors?.length > 0) {
    issues.push(`JSON validation failed: ${result.pipeline_steps.validation.errors.join(", ")}`);
  }

  // Check intent
  if (data.intent !== testCase.expected_intent) {
    issues.push(
      `Intent mismatch: expected "${testCase.expected_intent}", got "${data.intent}"`
    );
  }

  // Check urgency
  if (data.urgency !== testCase.expected_urgency) {
    issues.push(
      `Urgency mismatch: expected "${testCase.expected_urgency}", got "${data.urgency}"`
    );
  }

  // Check needs_human for adversarial/gibberish (must be true)
  if (testCase.expected_needs_human && !data.needs_human) {
    issues.push(`Expected needs_human=true, got false`);
  }

  // Check auto-escalation rule
  if (data.confidence < 0.6 && !data.needs_human) {
    issues.push(
      `Auto-escalation violation: confidence=${data.confidence} but needs_human=false`
    );
  }

  // Check no empty fields
  const emptyFields = Object.entries(data)
    .filter(([, v]) => v === null || v === undefined || v === "")
    .map(([k]) => k);
  if (emptyFields.length > 0) {
    issues.push(`Empty fields detected: ${emptyFields.join(", ")}`);
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}

// ─── Run Evaluator ────────────────────────────────────────────────────────────

async function runEvaluation() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  MUMZWORLD AI SUPPORT — EVALUATION SUITE");
  console.log(`  ${TEST_CASES.length} test cases | Model: deepseek/deepseek-chat`);
  console.log("═══════════════════════════════════════════════════════════\n");

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const testCase of TEST_CASES) {
    process.stdout.write(`Running ${testCase.id} [${testCase.category}] "${testCase.description}"... `);

    let result;
    try {
      result = await runPipeline(testCase.message);
    } catch (err) {
      result = {
        success: false,
        error: err.message,
        data: {},
        pipeline_steps: { validation: { valid: false, errors: [err.message] } },
      };
    }

    const evaluation = evaluateResult(testCase, result);

    if (evaluation.passed) {
      passed++;
      console.log("✅ PASSED");
    } else {
      failed++;
      console.log("❌ FAILED");
      evaluation.issues.forEach((issue) => console.log(`   ⚠️  ${issue}`));
    }

    results.push({
      ...testCase,
      actual_intent: result.data?.intent,
      actual_urgency: result.data?.urgency,
      actual_confidence: result.data?.confidence,
      actual_needs_human: result.data?.needs_human,
      passed: evaluation.passed,
      issues: evaluation.issues,
      reasoning: result.data?.reasoning,
    });

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  // ─── Summary ───────────────────────────────────────────────────────────────

  const accuracy = ((passed / TEST_CASES.length) * 100).toFixed(1);

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  EVALUATION RESULTS");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Total:   ${TEST_CASES.length}`);
  console.log(`  Passed:  ${passed} ✅`);
  console.log(`  Failed:  ${failed} ❌`);
  console.log(`  Accuracy: ${accuracy}%`);
  console.log("═══════════════════════════════════════════════════════════\n");

  // Category breakdown
  const categories = [...new Set(TEST_CASES.map((t) => t.category))];
  console.log("  CATEGORY BREAKDOWN:");
  for (const cat of categories) {
    const catTests = results.filter((r) => r.category === cat);
    const catPassed = catTests.filter((r) => r.passed).length;
    console.log(`    ${cat}: ${catPassed}/${catTests.length} passed`);
  }

  // Failure details
  const failures = results.filter((r) => !r.passed);
  if (failures.length > 0) {
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("  FAILURE ANALYSIS");
    console.log("═══════════════════════════════════════════════════════════");
    for (const f of failures) {
      console.log(`\n  [${f.id}] ${f.description}`);
      console.log(`  Message: "${f.message}"`);
      console.log(`  Expected: intent=${f.expected_intent}, urgency=${f.expected_urgency}`);
      console.log(`  Actual:   intent=${f.actual_intent}, urgency=${f.actual_urgency}, confidence=${f.actual_confidence}`);
      console.log(`  Issues:`);
      f.issues.forEach((i) => console.log(`    - ${i}`));
      if (f.reasoning) console.log(`  AI Reasoning: ${f.reasoning}`);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  Evaluation complete.");
  console.log("═══════════════════════════════════════════════════════════\n");
}

runEvaluation().catch(console.error);
