const CODERABBIT_USERNAME = "coderabbitai";

const SEVERITY_PATTERNS = {
  nitpick: /\[nitpick\]/i,
  suggestion: /\[suggestion\]/i,
  warning: /\[warning\]/i,
  issue: /\[issue\]/i,
};

let currentSettings = { nitpick: true, suggestion: true, warning: true, issue: true };

function isCodeRabbitComment(commentEl) {
  const authorEl =
    commentEl.querySelector(".author") ||
    commentEl.querySelector("a.Link--primary");
  if (!authorEl) return false;
  return authorEl.textContent.trim().toLowerCase() === CODERABBIT_USERNAME;
}

function detectSeverity(commentEl) {
  const body =
    commentEl.querySelector(".comment-body") ||
    commentEl.querySelector(".review-comment-body") ||
    commentEl.querySelector("td.comment-body");
  if (!body) return null;

  const text = body.textContent;
  for (const [severity, pattern] of Object.entries(SEVERITY_PATTERNS)) {
    if (pattern.test(text)) return severity;
  }
  return null;
}

function getCommentElements() {
  return document.querySelectorAll(
    ".timeline-comment, .review-comment, .js-comment, [data-body-version]"
  );
}

function applyFilters() {
  let hiddenCount = 0;

  getCommentElements().forEach((el) => {
    if (!isCodeRabbitComment(el)) return;

    const severity = detectSeverity(el);
    if (!severity) return;

    const shouldShow = currentSettings[severity] !== false;

    // Walk up to the nearest hideable container (inline comment thread, timeline item, etc.)
    const container = el.closest(".js-timeline-item") || el.closest(".js-resolvable-timeline-thread-container") || el;

    if (shouldShow) {
      container.style.display = "";
      container.classList.remove("coderabbit-hidden");
    } else {
      container.style.display = "none";
      container.classList.add("coderabbit-hidden");
      hiddenCount++;
    }
  });

  return hiddenCount;
}

// Listen for settings changes from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "UPDATE_SEVERITY_FILTER") {
    currentSettings = message.settings;
    applyFilters();
    sendResponse({ ok: true });
  } else if (message.type === "GET_HIDDEN_COUNT") {
    const hiddenCount = applyFilters();
    sendResponse({ hiddenCount });
  }
  return true;
});

// Load saved settings on page load
chrome.storage.sync.get("severitySettings", (result) => {
  if (result.severitySettings) {
    currentSettings = result.severitySettings;
  }
  applyFilters();
});

// Re-apply when GitHub dynamically loads content (SPA navigation, lazy-loaded comments)
const observer = new MutationObserver(() => {
  applyFilters();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});
