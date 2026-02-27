const CODERABBIT_USERNAME = "coderabbitai";

const SEVERITY_PATTERNS = {
  nitpick: /\[nitpick\]/i,
  suggestion: /\[suggestion\]/i,
  warning: /\[warning\]/i,
  issue: /\[issue\]/i,
};

let currentSettings = { nitpick: true, suggestion: true, warning: true, issue: true };

// ── Comment detection helpers ──────────────────────────────────────────

function isCodeRabbitComment(commentEl) {
  const authorEl =
    commentEl.querySelector(".author") ||
    commentEl.querySelector("a.Link--primary");
  if (!authorEl) return false;
  return authorEl.textContent.trim().toLowerCase() === CODERABBIT_USERNAME;
}

function detectSeverity(commentEl) {
  const body = getCommentBody(commentEl);
  if (!body) return null;

  const text = body.textContent;
  for (const [severity, pattern] of Object.entries(SEVERITY_PATTERNS)) {
    if (pattern.test(text)) return severity;
  }
  return null;
}

function getCommentBody(commentEl) {
  return (
    commentEl.querySelector(".comment-body") ||
    commentEl.querySelector(".review-comment-body") ||
    commentEl.querySelector("td.comment-body")
  );
}

function getCommentElements() {
  return document.querySelectorAll(
    ".timeline-comment, .review-comment, .js-comment, [data-body-version]"
  );
}

// ── Severity counting ──────────────────────────────────────────────────

function countSeverities() {
  const counts = { nitpick: 0, suggestion: 0, warning: 0, issue: 0 };
  getCommentElements().forEach((el) => {
    if (!isCodeRabbitComment(el)) return;
    const severity = detectSeverity(el);
    if (severity) counts[severity]++;
  });
  return counts;
}

// ── File grouping ──────────────────────────────────────────────────────

function getFileForComment(commentEl) {
  // Try to find the file path from the surrounding diff/file context
  const threadContainer = commentEl.closest(
    ".js-resolvable-timeline-thread-container"
  );
  if (threadContainer) {
    const fileLink = threadContainer.querySelector(
      ".file-info a, .file-header a, a[title]"
    );
    if (fileLink) return fileLink.textContent.trim() || fileLink.getAttribute("title") || "";
  }

  // Try file header above the comment
  const fileContainer = commentEl.closest("[data-file-path]");
  if (fileContainer) {
    return fileContainer.getAttribute("data-file-path");
  }

  return "(general)";
}

function getFileGroups() {
  const groups = {};

  getCommentElements().forEach((el) => {
    if (!isCodeRabbitComment(el)) return;
    const severity = detectSeverity(el);
    if (!severity) return;

    const file = getFileForComment(el);
    if (!groups[file]) {
      groups[file] = { nitpick: 0, suggestion: 0, warning: 0, issue: 0 };
    }
    groups[file][severity]++;
  });

  return Object.entries(groups)
    .map(([file, counts]) => ({
      file,
      counts,
      total: Object.values(counts).reduce((s, v) => s + v, 0),
    }))
    .sort((a, b) => b.total - a.total);
}

// ── Scroll to file ─────────────────────────────────────────────────────

function scrollToFile(fileName) {
  // Find the file header element on the page
  const fileHeaders = document.querySelectorAll(
    "[data-file-path], .file-info a, .file-header a"
  );

  for (const header of fileHeaders) {
    const path =
      header.getAttribute("data-file-path") ||
      header.textContent.trim() ||
      header.getAttribute("title");
    if (path === fileName) {
      const target = header.closest(".js-file, .file, .js-diff-progressive-container") || header;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      // Flash highlight
      target.style.transition = "outline 0.3s";
      target.style.outline = "3px solid #0969da";
      setTimeout(() => {
        target.style.outline = "";
      }, 2000);
      return true;
    }
  }
  return false;
}

// ── Toast notifications ────────────────────────────────────────────────

const TOAST_ID = "coderabbit-toast";

function showToast(message, severity) {
  let toast = document.getElementById(TOAST_ID);
  if (!toast) {
    toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }

  const colors = {
    info: { bg: "#ddf4ff", border: "#54aeff", text: "#0550ae" },
    success: { bg: "#dafbe1", border: "#4ac26b", text: "#116329" },
    warning: { bg: "#fff8c5", border: "#d4a72c", text: "#633c01" },
  };

  const style = colors[severity] || colors.info;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%) translateY(0);
    z-index: 99999;
    padding: 10px 20px;
    border-radius: 8px;
    border: 1px solid ${style.border};
    background: ${style.bg};
    color: ${style.text};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    opacity: 1;
    transition: opacity 0.3s, transform 0.3s;
    pointer-events: none;
  `;

  clearTimeout(toast._hideTimeout);
  toast._hideTimeout = setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(10px)";
  }, 2500);
}

// ── Core filter logic ──────────────────────────────────────────────────

function applyFilters() {
  let hiddenCount = 0;

  getCommentElements().forEach((el) => {
    if (!isCodeRabbitComment(el)) return;

    const severity = detectSeverity(el);
    if (!severity) return;

    const shouldShow = currentSettings[severity] !== false;

    // Walk up to the nearest hideable container
    const container =
      el.closest(".js-timeline-item") ||
      el.closest(".js-resolvable-timeline-thread-container") ||
      el;

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

// ── Message handling ───────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case "UPDATE_SEVERITY_FILTER": {
      const prev = { ...currentSettings };
      currentSettings = message.settings;
      const hiddenCount = applyFilters();

      // Show toast for filter changes
      const changed = Object.keys(currentSettings).filter(
        (k) => currentSettings[k] !== prev[k]
      );
      if (changed.length > 0) {
        const action = currentSettings[changed[0]] ? "Showing" : "Hiding";
        if (changed.length === 4) {
          showToast(
            currentSettings[changed[0]] ? "All comments visible" : "All comments hidden",
            "info"
          );
        } else {
          showToast(`${action} ${changed.join(", ")} comments`, "info");
        }
      }

      sendResponse({ ok: true });
      break;
    }

    case "GET_HIDDEN_COUNT": {
      const hiddenCount = applyFilters();
      sendResponse({ hiddenCount });
      break;
    }

    case "GET_SEVERITY_COUNTS": {
      const counts = countSeverities();
      sendResponse({ counts });
      break;
    }

    case "GET_FILE_GROUPS": {
      const fileGroups = getFileGroups();
      sendResponse({ fileGroups });
      break;
    }

    case "SCROLL_TO_FILE": {
      const found = scrollToFile(message.file);
      sendResponse({ found });
      break;
    }

    case "SET_THEME": {
      // Store theme preference for content-injected elements
      document.documentElement.setAttribute(
        "data-coderabbit-theme",
        message.theme
      );
      sendResponse({ ok: true });
      break;
    }
  }

  return true;
});

// ── Initialization ─────────────────────────────────────────────────────

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
