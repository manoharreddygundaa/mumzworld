/**
 * validator.js
 * Validates the structured JSON output from the AI pipeline.
 */

const REQUIRED_FIELDS = [
  "intent",
  "urgency",
  "category",
  "confidence",
  "needs_human",
  "reply_en",
  "reply_ar",
  "reasoning",
  "evidence",
  "suggested_action",
];

const VALID_INTENTS = [
  "refund_request",
  "order_tracking",
  "exchange_request",
  "complaint",
  "product_query",
  "greeting",
  "unknown",
];

const VALID_URGENCIES = ["low", "medium", "high"];

const VALID_CATEGORIES = [
  "delivery_issue",
  "payment_issue",
  "product_issue",
  "general",
];

/**
 * Validates the AI output against the required schema.
 * @param {object} data - Parsed JSON output
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateOutput(data) {
  const errors = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Output is not a valid object"] };
  }

  // Check required fields exist and are non-empty
  for (const field of REQUIRED_FIELDS) {
    if (!(field in data)) {
      errors.push(`Missing required field: "${field}"`);
    } else if (data[field] === null || data[field] === undefined) {
      errors.push(`Field "${field}" must not be null`);
    } else if (typeof data[field] === "string" && data[field].trim() === "") {
      errors.push(`Field "${field}" must not be empty`);
    }
  }

  // Validate intent
  if (data.intent && !VALID_INTENTS.includes(data.intent)) {
    errors.push(
      `Invalid intent: "${data.intent}". Must be one of: ${VALID_INTENTS.join(", ")}`
    );
  }

  // Validate urgency
  if (data.urgency && !VALID_URGENCIES.includes(data.urgency)) {
    errors.push(
      `Invalid urgency: "${data.urgency}". Must be one of: ${VALID_URGENCIES.join(", ")}`
    );
  }

  // Validate category
  if (data.category && !VALID_CATEGORIES.includes(data.category)) {
    errors.push(
      `Invalid category: "${data.category}". Must be one of: ${VALID_CATEGORIES.join(", ")}`
    );
  }

  // Validate confidence
  if ("confidence" in data) {
    const conf = data.confidence;
    if (typeof conf !== "number") {
      errors.push(`"confidence" must be a number, got: ${typeof conf}`);
    } else if (conf < 0 || conf > 1) {
      errors.push(`"confidence" must be between 0 and 1, got: ${conf}`);
    }
  }

  // Validate needs_human
  if ("needs_human" in data && typeof data.needs_human !== "boolean") {
    errors.push(
      `"needs_human" must be a boolean, got: ${typeof data.needs_human}`
    );
  }

  // Auto-escalation consistency check
  if (
    "confidence" in data &&
    "needs_human" in data &&
    data.confidence < 0.6 &&
    !data.needs_human
  ) {
    errors.push(
      `Consistency error: confidence is ${data.confidence} (< 0.6) but needs_human is false`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Attempts to safely parse JSON from a string, handling code blocks.
 * @param {string} text
 * @returns {{ parsed: object|null, error: string|null }}
 */
function safeParseJSON(text) {
  try {
    // Remove markdown code blocks if present
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/```json?\n?/g, "").replace(/```$/g, "").trim();
    }
    const parsed = JSON.parse(cleaned);
    return { parsed, error: null };
  } catch (err) {
    return { parsed: null, error: `JSON parse error: ${err.message}` };
  }
}

module.exports = { validateOutput, safeParseJSON };
