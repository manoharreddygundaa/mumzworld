/**
 * app.js
 * Frontend logic for Mumzworld AI Support Intelligence UI
 */

const API_BASE = "http://localhost:3001";

// ─── DOM References ───────────────────────────────

const messageInput = document.getElementById("messageInput");
const analyzeBtn = document.getElementById("analyzeBtn");
const charCount = document.getElementById("charCount");
const statusDot = document.getElementById("statusDot");

const placeholder = document.getElementById("placeholder");
const loading = document.getElementById("loading");
const results = document.getElementById("results");

// ─── Char Counter ─────────────────────────────────

messageInput.addEventListener("input", () => {
  const len = messageInput.value.length;
  charCount.textContent = `${len} / 2000`;
  charCount.style.color = len > 1800 ? "var(--red)" : "var(--text-dim)";
});

// ─── Quick Test Helper ────────────────────────────

function setMessage(text) {
  messageInput.value = text;
  charCount.textContent = `${text.length} / 2000`;
  messageInput.focus();
}

// ─── Loading Steps Animation ──────────────────────

function animateLoadingSteps() {
  const steps = document.querySelectorAll(".step");
  let current = 0;
  steps.forEach((s) => s.classList.remove("active"));
  steps[0].classList.add("active");

  const interval = setInterval(() => {
    steps[current]?.classList.remove("active");
    current++;
    if (current < steps.length) {
      steps[current].classList.add("active");
    } else {
      clearInterval(interval);
    }
  }, 700);

  return interval;
}

// ─── Show / Hide States ───────────────────────────

function showLoading() {
  placeholder.style.display = "none";
  results.style.display = "none";
  loading.style.display = "flex";
}

function showResults() {
  loading.style.display = "none";
  placeholder.style.display = "none";
  results.style.display = "flex";
}

function showPlaceholder() {
  loading.style.display = "none";
  results.style.display = "none";
  placeholder.style.display = "flex";
}

// ─── Toast ────────────────────────────────────────

function showToast(message, type = "error") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => {
    toast.className = "toast";
  }, 4000);
}

// ─── Tab Switcher ─────────────────────────────────

function switchTab(lang) {
  const enContent = document.getElementById("replyEn");
  const arContent = document.getElementById("replyAr");
  const tabs = document.querySelectorAll(".tab-btn");

  if (lang === "en") {
    enContent.style.display = "block";
    arContent.style.display = "none";
    tabs[0].classList.add("active");
    tabs[1].classList.remove("active");
  } else {
    enContent.style.display = "none";
    arContent.style.display = "block";
    tabs[0].classList.remove("active");
    tabs[1].classList.add("active");
  }
}

// ─── Copy JSON ────────────────────────────────────

function copyJSON() {
  const json = document.getElementById("rawJSON").textContent;
  navigator.clipboard
    .writeText(json)
    .then(() => showToast("JSON copied to clipboard", "success"))
    .catch(() => showToast("Failed to copy", "error"));
}

// ─── Format Intent ────────────────────────────────

function formatIntent(intent) {
  return intent.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCategory(category) {
  return category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Render Results ───────────────────────────────

function renderResults(data, pipelineSteps) {
  // Intent
  document.getElementById("resIntent").textContent = formatIntent(data.intent);

  // Urgency
  const urgencyEl = document.getElementById("resUrgency");
  urgencyEl.textContent = data.urgency.toUpperCase();
  urgencyEl.closest(".result-card").setAttribute("data-urgency", data.urgency);

  // Category
  document.getElementById("resCategory").textContent = formatCategory(data.category);

  // Confidence bar
  const conf = data.confidence;
  const confPct = Math.round(conf * 100);
  const confBar = document.getElementById("confBar");
  const confValue = document.getElementById("confValue");

  setTimeout(() => {
    confBar.style.width = `${confPct}%`;
  }, 100);

  confBar.className = "conf-bar";
  if (conf >= 0.75) {
    confBar.classList.add("high");
    confValue.style.color = "var(--green)";
  } else if (conf >= 0.5) {
    confBar.classList.add("medium");
    confValue.style.color = "var(--amber)";
  } else {
    confBar.classList.add("low");
    confValue.style.color = "var(--red)";
  }
  confValue.textContent = `${confPct}%`;

  // Human badge
  const badge = document.getElementById("humanBadge");
  const badgeText = document.getElementById("humanBadgeText");
  if (data.needs_human) {
    badge.className = "human-badge escalate";
    badge.querySelector(".badge-icon").textContent = "⚠";
    badgeText.textContent = "NEEDS HUMAN";
  } else {
    badge.className = "human-badge auto";
    badge.querySelector(".badge-icon").textContent = "✓";
    badgeText.textContent = "AUTO-HANDLED";
  }

  // Replies
  document.getElementById("replyEn").textContent = data.reply_en;
  document.getElementById("replyAr").textContent = data.reply_ar;
  switchTab("en");

  // Suggested action
  document.getElementById("resAction").textContent = data.suggested_action;

  // Reasoning + evidence
  document.getElementById("resReasoning").textContent = data.reasoning;
  document.getElementById("resEvidence").textContent = data.evidence;
  document.getElementById("resContextIds").textContent =
    pipelineSteps?.rag_context_ids?.join(", ") || "none";

  // Raw JSON
  const fullOutput = {
    ...data,
    _pipeline_meta: pipelineSteps,
  };
  document.getElementById("rawJSON").textContent = JSON.stringify(fullOutput, null, 2);
}

// ─── Main Analyze Function ────────────────────────

async function analyze() {
  const message = messageInput.value.trim();

  if (!message) {
    showToast("Please enter a message to analyze");
    messageInput.focus();
    return;
  }

  // Set UI to loading state
  analyzeBtn.disabled = true;
  statusDot.className = "status-dot loading";
  showLoading();
  const stepInterval = animateLoadingSteps();

  try {
    const response = await fetch(`${API_BASE}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    clearInterval(stepInterval);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error ${response.status}`);
    }

    const result = await response.json();

    if (!result.data) {
      throw new Error("Invalid response structure from server");
    }

    renderResults(result.data, result.pipeline_steps);
    showResults();
    statusDot.className = "status-dot ready";
  } catch (err) {
    clearInterval(stepInterval);
    console.error("Analyze error:", err);
    showPlaceholder();
    statusDot.className = "status-dot error";

    if (err.message.includes("Failed to fetch") || err.message.includes("NetworkError")) {
      showToast(
        "Cannot connect to backend. Is the server running on port 3001?",
        "error"
      );
    } else {
      showToast(`Error: ${err.message}`, "error");
    }
  } finally {
    analyzeBtn.disabled = false;
  }
}

// ─── Enter Key Support ────────────────────────────

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    analyze();
  }
});

// ─── Health Check on Load ─────────────────────────

window.addEventListener("load", async () => {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      statusDot.className = "status-dot ready";
    }
  } catch {
    // Backend not running yet — that's ok
    statusDot.className = "status-dot";
  }
});
