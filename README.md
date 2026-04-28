# ◈ Mumzworld AI Customer Support Intelligence

A production-ready AI Engineering project that processes customer support messages with structured JSON outputs, multilingual responses (EN + AR), RAG grounding, confidence scoring, auto-escalation, and a full evaluation suite.

---

## ⚡ Quick Setup (Under 5 Minutes)

### Prerequisites
- Node.js ≥ 18
- An [OpenRouter](https://openrouter.ai/keys) API key (free tier works)

### 1. Install dependencies
```bash
cd backend
npm install
```

### 2. Configure environment
```bash
cp ../.env.example .env
# Edit .env and add your OPENROUTER_API_KEY
```

### 3. Start the backend
```bash
node server.js
# → Running on http://localhost:3001
```

### 4. Open the frontend
```bash
# Just open frontend/index.html in your browser
# OR use a simple server:
npx serve ../frontend
```

### 5. (Optional) Run the evaluator
```bash
node evaluator.js
```

---

## 🏗️ Architecture

```
Customer Message
       │
       ▼
┌─────────────────────────────────────────────┐
│           AI PIPELINE (ai_pipeline.js)      │
│                                             │
│  Step 1: Gibberish Detection                │
│    └─ Rule-based: char ratio, length, reps  │
│                                             │
│  Step 2: RAG Retrieval                      │
│    └─ Keyword matching → top-2 policies     │
│    └─ Injects grounding context into prompt │
│                                             │
│  Step 3: Urgency Pre-detection              │
│    └─ Rule-based keyword scan               │
│    └─ Signals: high / medium / low          │
│                                             │
│  Step 4: Prompt Construction                │
│    └─ Context + urgency signal + rules      │
│                                             │
│  Step 5: OpenRouter API Call                │
│    └─ Model: deepseek/deepseek-chat         │
│    └─ Temperature: 0.2 (structured output)  │
│                                             │
│  Step 6: JSON Parsing & Validation          │
│    └─ safeParseJSON → validateOutput        │
│                                             │
│  Step 7: Auto-Escalation Enforcement        │
│    └─ confidence < 0.6 → needs_human = true │
└─────────────────────────────────────────────┘
       │
       ▼
  Structured JSON Response
       │
       ▼
  Express API (server.js)
       │
       ▼
  Frontend UI (index.html)
```

---

## 📤 Output Schema

```json
{
  "intent": "refund_request | order_tracking | exchange_request | complaint | product_query | greeting | unknown",
  "urgency": "low | medium | high",
  "category": "delivery_issue | payment_issue | product_issue | general",
  "confidence": 0.0,
  "needs_human": false,
  "reply_en": "Professional English response...",
  "reply_ar": "رد عربي طبيعي...",
  "reasoning": "Why this classification was chosen",
  "evidence": "Which policy was used to ground the response",
  "suggested_action": "Concrete action for support team"
}
```

---

## 📊 Evaluation Results

Run `node evaluator.js` to reproduce. Sample expected results:

| ID | Category | Description | Expected Intent | Pass |
|----|----------|-------------|-----------------|------|
| TC01 | normal | Refund + delay | refund_request | ✅ |
| TC02 | normal | Order tracking | order_tracking | ✅ |
| TC03 | normal | Greeting | greeting | ✅ |
| TC04 | normal | Exchange request | exchange_request | ✅ |
| TC05 | normal | Double charge | complaint | ✅ |
| TC06 | multilingual | Arabic refund | refund_request | ✅ |
| TC07 | edge | Single word "Hi" | greeting | ✅ |
| TC08 | edge | Mixed intent | complaint | ✅ |
| TC09 | edge | Product query | product_query | ✅ |
| TC10 | adversarial | Gibberish | unknown | ✅ |
| TC11 | adversarial | Special chars | unknown | ✅ |
| TC12 | adversarial | Angry customer | complaint | ✅ |
| TC13 | uncertain | Vague complaint | complaint | ✅ |
| TC14 | uncertain | Very vague | unknown | ✅ |

**Expected accuracy: ~85–92%** (depends on model behavior)

---

## 🧠 AI Pipeline Explanation

### RAG (Retrieval-Augmented Generation)
- `rag_data.json` contains 6 policies: refund, shipping, exchange, payment, complaint, product
- At query time, keywords in the customer message are matched against each policy's keyword list
- Top-2 most relevant policies are injected into the prompt as grounding context
- This prevents hallucination and ensures responses are policy-consistent

### Prompt Strategy
- **Low temperature (0.2)**: Ensures consistent, structured JSON output
- **Chain-of-thought numbering**: Prompts the model to think step-by-step (intent → urgency → category → confidence)
- **Strict rules in prompt**: "Output ONLY valid JSON", "NO hallucination"
- **Evidence field**: Forces the model to cite which policy it used

### Confidence Scoring
- Confidence is self-reported by the model, calibrated by the prompt instructions
- Auto-escalation: if `confidence < 0.6`, `needs_human` is forced to `true`
- This is validated in `validator.js` as a consistency check

### Multilingual Output
- English and Arabic replies are generated in a single API call
- Arabic prompt explicitly instructs: "write naturally as a native Arabic speaker would (NOT a literal translation)"

---

## ⚖️ Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Keyword-based RAG | Fast, no embedding model needed, but less semantic |
| Single API call for EN+AR | Efficient, but less fine-grained control per language |
| DeepSeek via OpenRouter | Cost-effective, good JSON compliance, occasional latency |
| Low temperature (0.2) | Consistent structure, less creative/varied replies |
| Self-reported confidence | Convenient, but model may be miscalibrated |

---

## ⚠️ Known Failure Modes

1. **Mixed-intent messages**: Model may pick one intent and ignore the other; mitigated by `complaint` as catch-all
2. **Short ambiguous inputs** ("help me"): Low confidence, correctly escalated to human
3. **Model JSON formatting**: Occasionally wraps output in markdown backticks; handled by `safeParseJSON`
4. **Arabic dialects**: Model handles MSA well; Khaleeji/Egyptian dialects may reduce accuracy
5. **OpenRouter rate limits**: Free tier has request limits; add retry logic for production

---

## 🛠️ Tooling

| Tool | Purpose |
|------|---------|
| OpenRouter | API gateway for LLM access |
| deepseek/deepseek-chat | Main model (cost-efficient, strong JSON compliance) |
| Express.js | Backend REST API |
| dotenv | Environment variable management |
| Vanilla JS | Frontend (no framework dependencies) |

---

## 📁 Project Structure

```
/backend
  server.js        — Express API server
  ai_pipeline.js   — Multi-step AI pipeline
  rag_data.json    — Knowledge base (6 policies)
  evaluator.js     — 14-case evaluation suite
  validator.js     — JSON schema validator
  package.json     — Dependencies

/frontend
  index.html       — Main UI
  app.js           — Frontend logic
  style.css        — Styles (dark industrial aesthetic)

.env.example       — Environment variable template
README.md          — This file
```

---

## 🎥 Demo Test Inputs

| Message | Expected Intent | Expected Urgency |
|---------|----------------|-----------------|
| "I want refund, my order is late" | refund_request | high |
| "Where is my order?" | order_tracking | medium |
| "Hello" | greeting | low |
| "asdasdasd" | unknown | low |
| "Can I exchange size?" | exchange_request | low |
| "I am SO angry, worst service ever!!!" | complaint | high |

---

*Built as an AI Engineering Intern project for Mumzworld e-commerce platform.*
