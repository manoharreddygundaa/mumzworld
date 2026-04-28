/**
 * server.js
 * Express backend for Mumzworld AI Customer Support Assistant
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { runPipeline } = require("./ai_pipeline");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    model: "deepseek/deepseek-chat",
    api_key_set: !!process.env.OPENROUTER_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// ─── Main Analyze Endpoint ────────────────────────────────────────────────────

app.post("/analyze", async (req, res) => {
  const { message } = req.body;

  // Input validation
  if (!message || typeof message !== "string") {
    return res.status(400).json({
      error: "Invalid request: 'message' field is required and must be a string",
      example: { message: "I want a refund for my delayed order" },
    });
  }

  if (message.trim().length === 0) {
    return res.status(400).json({
      error: "Message cannot be empty",
    });
  }

  if (message.length > 2000) {
    return res.status(400).json({
      error: "Message too long. Maximum 2000 characters allowed.",
    });
  }

  console.log(`[${new Date().toISOString()}] Analyzing: "${message.substring(0, 60)}..."`);

  try {
    const result = await runPipeline(message);

    console.log(
      `[${new Date().toISOString()}] Result: intent=${result.data?.intent}, confidence=${result.data?.confidence}, needs_human=${result.data?.needs_human}`
    );

    return res.json({
      success: result.success,
      data: result.data,
      pipeline_steps: result.pipeline_steps,
      ...(result.error && { error: result.error }),
      ...(result.raw && { raw_response: result.raw }),
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Unhandled error:`, err);
    return res.status(500).json({
      error: "Internal server error",
      message: err.message,
      data: {
        intent: "unknown",
        urgency: "low",
        category: "general",
        confidence: 0.0,
        needs_human: true,
        reply_en: "We're experiencing technical difficulties. A human agent will assist you.",
        reply_ar: "نواجه صعوبات تقنية. سيساعدك أحد وكلائنا قريبًا.",
        reasoning: "Server error occurred during processing.",
        evidence: "N/A",
        suggested_action: "Escalate to human agent",
      },
    });
  }
});

// ─── Start Server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 Mumzworld AI Support Backend running on port ${PORT}`);
  console.log(`📡 POST http://localhost:${PORT}/analyze`);
  console.log(`🔑 API Key set: ${!!process.env.OPENROUTER_API_KEY}\n`);
});