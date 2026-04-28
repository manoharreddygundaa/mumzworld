/**
 * ai_pipeline.js
 * Multi-step AI pipeline:
 * 1. Gibberish / empty detection
 * 2. RAG retrieval (keyword-based, top-k)
 * 3. Intent + urgency + category detection
 * 4. Confidence scoring & risk detection
 * 5. Response generation (EN + AR) via OpenRouter
 * 6. JSON schema validation
 */

const ragData = require("./rag_data.json");
const { validateOutput, safeParseJSON } = require("./validator");

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "deepseek/deepseek-chat";

// ─── Step 1: Gibberish Detection ────────────────────────────────────────────

function isGibberish(message) {
  if (!message || message.trim().length === 0) return true;
  const cleaned = message.trim();
  // Too short but allow common greetings and short words
  const commonShortWords = ["hi", "hey", "ok", "no", "yes", "bye", "help"];
  if (cleaned.length <= 2) {
    return !commonShortWords.includes(cleaned.toLowerCase());
  }
  // Mostly non-alphabetic characters (no Arabic or Latin letters)
  const letterCount = (cleaned.match(/[a-zA-Z\u0600-\u06FF]/g) || []).length;
  const ratio = letterCount / cleaned.length;
  if (ratio < 0.3 && cleaned.length > 5) return true;
  // Repetitive char pattern like "aaaaaa" or "asdasdasd"
  const repetitivePattern = /^(.)\1{4,}$/.test(cleaned);
  if (repetitivePattern) return true;
  return false;
}

// ─── Step 2: RAG Retrieval ───────────────────────────────────────────────────

function retrieveContext(message) {
  const msgLower = message.toLowerCase();
  const scores = ragData.policies.map((policy) => {
    const matchCount = policy.keywords.filter((kw) =>
      msgLower.includes(kw.toLowerCase())
    ).length;
    return { policy, score: matchCount };
  });

  // Sort by relevance, take top 2
  const top = scores
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((s) => s.policy);

  if (top.length === 0) {
    // Fallback: return general policy
    return [ragData.policies[5]]; // product_query_policy
  }

  return top;
}

// ─── Step 3: Urgency Pre-detection (rule-based signal) ───────────────────────

function detectUrgencySignal(message) {
  const highUrgencyWords = [
    "urgent",
    "immediately",
    "asap",
    "now",
    "emergency",
    "angry",
    "furious",
    "outraged",
    "unacceptable",
    "terrible",
    "worst",
    "horrible",
    "awful",
    "refund",
    "stolen",
    "عاجل",
    "فوراً",
    "غاضب",
    "مروع",
    "استرجاع",
    "استرداد",
  ];
  const mediumUrgencyWords = [
    "delay",
    "delayed",
    "late",
    "waiting",
    "still",
    "not received",
    "problem",
    "issue",
    "wrong",
    "broken",
    "تأخير",
    "تأخر",
    "انتظار",
    "لم أستقبل",
    "لم أتلقى",
    "مشكلة",
  ];
  
  // Vague distress words - should be medium, not high
  const vagueDistressWords = [
    "something wrong",
    "something happened",
    "something is wrong",
    "not sure",
    "don't know",
    "confused",
    "unclear",
  ];
  
  // Product query detection (should be low urgency by default)
  const productQueryWords = [
    "available",
    "color",
    "size",
    "price",
    "stock",
    "buy",
    "purchase",
    "recommend",
    "feature",
    "specification",
    "هل",
  ];

  const msgLower = message.toLowerCase();
  
  // Check if it's a vague distress message
  const hasVagueDistress = vagueDistressWords.some((w) => msgLower.includes(w));
  
  // Check if it's a product query - if so, default to low unless high urgency words present
  const isProductQuery = productQueryWords.some((w) => msgLower.includes(w));
  
  const hasHigh = highUrgencyWords.some((w) => msgLower.includes(w));
  const hasMedium = mediumUrgencyWords.some((w) => msgLower.includes(w));

  if (hasHigh && !hasVagueDistress) return "high"; // High urgency unless vague
  if (hasVagueDistress) return "medium"; // Vague distress = medium
  if (isProductQuery && !hasMedium) return "low"; // Product queries without urgency signals = low
  if (hasMedium) return "medium";
  return "low";
}

// ─── Step 4: Build Prompt ────────────────────────────────────────────────────

function buildPrompt(message, retrievedContext, urgencySignal) {
  const contextText = retrievedContext
    .map((p) => `[${p.title}]: ${p.content}`)
    .join("\n\n");

  const contextIds = retrievedContext.map((p) => p.id).join(", ");

  return `You are an expert AI customer support analyst for Mumzworld, an e-commerce platform.

CONTEXT (from knowledge base — use this to ground your response):
${contextText}

EVIDENCE SOURCE IDs: ${contextIds}

URGENCY SIGNAL (pre-detected): ${urgencySignal}

CUSTOMER MESSAGE: "${message}"

TASK: Analyze the customer message and produce a strict JSON response. Think step by step:

1. INTENT: What does the customer want?
   Options: refund_request | order_tracking | exchange_request | complaint | product_query | greeting | unknown
   SPECIAL RULES:
   - If message contains greeting words (hi, hello, hey, etc.) AND nothing else = "greeting"
   - If message contains vague words (something wrong, something happened, not sure, etc.) WITHOUT details = "complaint" (not unknown)
   - If message mentions MULTIPLE different issues (payment + missing order + returns) = "complaint"
   - If message is simple product availability check with no issues = "product_query"
   - If asking generic help without specifics (can you help me with something) = "unknown"

2. URGENCY: How urgent is this?
   Options: low | medium | high
   SPECIAL RULES:
   - Product availability queries with NO urgency signals = "low"
   - Order tracking with time mention (5 days, 1 week) = "medium"
   - Vague messages with distress words (something wrong, don't know what happened) = "medium" (NOT high)
   - Multilingual urgent messages (Arabic: استرجاع + تأخر) = "high"
   - Generic vague help requests = "low"

3. CATEGORY: What domain is this about?
   Options: delivery_issue | payment_issue | product_issue | general

4. CONFIDENCE: How confident are you in your classification? (0.0 to 1.0)
   - Be HONEST. Unclear or mixed-intent messages = lower confidence
   - Generic vague requests = 0.3-0.5 confidence
   - If confidence < 0.6, needs_human MUST be true

5. NEEDS_HUMAN: Should a human agent handle this?
   - true if: confidence < 0.6, OR high urgency + any complexity, OR double charge/payment fraud, OR angry tone detected, OR message is extremely vague

6. REPLY_EN: A professional, empathetic English reply (2-3 sentences, grounded in the context above)

7. REPLY_AR: A natural Arabic reply (NOT a literal translation — write naturally as a native Arabic speaker would)

8. REASONING: Explain your classification decisions (1-2 sentences)

9. EVIDENCE: Which context from the knowledge base did you use? Quote the key policy point used.

10. SUGGESTED_ACTION: One concrete action for the support team.
    Examples: "Process refund", "Send tracking link", "Escalate to senior agent", "Provide exchange form", "Request clarification"

STRICT RULES:
- Output ONLY valid JSON, no markdown, no extra text
- NO empty fields, NO null values
- Vague messages with distress = "complaint" intent (not "unknown")
- Generic help requests without specifics = "unknown" intent
- If confidence < 0.6, ALWAYS set needs_human=true
- Do NOT hallucinate policies not in the context

OUTPUT FORMAT (strict):
{
  "intent": "...",
  "urgency": "...",
  "category": "...",
  "confidence": 0.0,
  "needs_human": false,
  "reply_en": "...",
  "reply_ar": "...",
  "reasoning": "...",
  "evidence": "...",
  "suggested_action": "..."
}`;
}

// ─── Step 5: Call OpenRouter API ─────────────────────────────────────────────

async function callOpenRouter(prompt) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set in environment");

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://mumzworld-support.ai",
      "X-Title": "Mumzworld AI Support",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      temperature: 0.2, // Low temperature for consistent structured output
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from OpenRouter API");
  return content;
}

// ─── Step 6: Fallback for Gibberish ─────────────────────────────────────────

function buildGibberishResponse(message) {
  return {
    intent: "unknown",
    urgency: "low",
    category: "general",
    confidence: 0.1,
    needs_human: true,
    reply_en:
      "I'm sorry, I couldn't understand your message. Could you please rephrase your request? Our team is here to help you.",
    reply_ar:
      "عذراً، لم أتمكن من فهم رسالتك. هل يمكنك إعادة صياغة طلبك؟ فريقنا هنا لمساعدتك.",
    reasoning:
      "Input appears to be gibberish, random characters, or too short to classify meaningfully.",
    evidence:
      "No relevant policy retrieved — input did not match any known support topic.",
    suggested_action: "Request clarification from customer",
  };
}

// ─── Main Pipeline ────────────────────────────────────────────────────────────

async function runPipeline(message) {
  // Step 1: Gibberish check
  if (isGibberish(message)) {
    return {
      success: true,
      data: buildGibberishResponse(message),
      pipeline_steps: {
        gibberish_detected: true,
        rag_context_ids: [],
        urgency_signal: "low",
        validation: { valid: true, errors: [] },
      },
    };
  }

  // Step 2: RAG retrieval
  const retrievedContext = retrieveContext(message);
  const contextIds = retrievedContext.map((p) => p.id);

  // Step 3: Urgency pre-detection
  const urgencySignal = detectUrgencySignal(message);

  // Step 4: Build prompt
  const prompt = buildPrompt(message, retrievedContext, urgencySignal);

  // Step 5: Call AI
  let rawResponse;
  try {
    rawResponse = await callOpenRouter(prompt);
  } catch (err) {
    // API failure fallback
    return {
      success: false,
      error: `API call failed: ${err.message}`,
      data: {
        intent: "unknown",
        urgency: urgencySignal,
        category: "general",
        confidence: 0.0,
        needs_human: true,
        reply_en:
          "We're experiencing a technical issue. A human agent will assist you shortly.",
        reply_ar:
          "نواجه مشكلة تقنية. سيساعدك أحد وكلائنا البشريين قريبًا.",
        reasoning: "API failure — fallback response used.",
        evidence: "N/A — API unavailable.",
        suggested_action: "Escalate to human agent immediately",
      },
      pipeline_steps: {
        gibberish_detected: false,
        rag_context_ids: contextIds,
        urgency_signal: urgencySignal,
        validation: { valid: false, errors: ["API call failed"] },
      },
    };
  }

  // Step 6: Parse JSON
  const { parsed, error: parseError } = safeParseJSON(rawResponse);
  if (!parsed) {
    return {
      success: false,
      error: parseError,
      raw: rawResponse,
      data: buildGibberishResponse(message),
      pipeline_steps: {
        gibberish_detected: false,
        rag_context_ids: contextIds,
        urgency_signal: urgencySignal,
        validation: { valid: false, errors: [parseError] },
      },
    };
  }

  // Step 7: Auto-escalation enforcement
  if (parsed.confidence < 0.6) {
    parsed.needs_human = true;
  }

  // Step 8: Validate schema
  const validation = validateOutput(parsed);

  return {
    success: validation.valid,
    data: parsed,
    pipeline_steps: {
      gibberish_detected: false,
      rag_context_ids: contextIds,
      urgency_signal: urgencySignal,
      validation,
    },
  };
}

module.exports = { runPipeline };
