const CODERABBIT_USERNAME = "coderabbitai";

const SEVERITY_PATTERNS = {
  nitpick: /\[nitpick\]/i,
  suggestion: /\[suggestion\]/i,
  warning: /\[warning\]/i,
  issue: /\[issue\]/i,
};

let currentSettings = { nitpick: true, suggestion: true, warning: true, issue: true };
let options = { autoCollapse: false, showBadge: true, trackStats: true };

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
  const severityCounts = { nitpick: 0, suggestion: 0, warning: 0, issue: 0 };
  let totalScanned = 0;

  getCommentElements().forEach((el) => {
    if (!isCodeRabbitComment(el)) return;

    const severity = detectSeverity(el);
    if (!severity) return;

    totalScanned++;
    severityCounts[severity]++;

    const shouldShow = currentSettings[severity] !== false;

    // Walk up to the nearest hideable container
    const container =
      el.closest(".js-timeline-item") ||
      el.closest(".js-resolvable-timeline-thread-container") ||
      el;

    if (shouldShow) {
      container.style.display = "";
      container.classList.remove("coderabbit-hidden");
      container.classList.remove("coderabbit-collapsed");
      // Remove collapse overlay if present
      const overlay = container.querySelector(".coderabbit-collapse-bar");
      if (overlay) overlay.remove();
    } else {
      if (options.autoCollapse) {
        // Collapse mode: show a minimal bar instead of fully hiding
        container.style.display = "";
        container.classList.remove("coderabbit-hidden");
        container.classList.add("coderabbit-collapsed");

        if (!container.querySelector(".coderabbit-collapse-bar")) {
          const bar = document.createElement("div");
          bar.className = "coderabbit-collapse-bar";
          bar.innerHTML = `<span class="coderabbit-collapse-badge coderabbit-badge-${severity}">${severity}</span> <span class="coderabbit-collapse-text">CodeRabbit comment (click to expand)</span>`;
          bar.addEventListener("click", () => {
            container.classList.toggle("coderabbit-expanded");
          });
          container.prepend(bar);
        }
      } else {
        // Full hide mode
        container.style.display = "none";
        container.classList.add("coderabbit-hidden");
        container.classList.remove("coderabbit-collapsed");
        const overlay = container.querySelector(".coderabbit-collapse-bar");
        if (overlay) overlay.remove();
      }
      hiddenCount++;
    }
  });

  // Report to background for badge and stats
  if (options.showBadge) {
    chrome.runtime.sendMessage({ type: "UPDATE_BADGE", hiddenCount }).catch(() => {});
  }

  if (options.trackStats && totalScanned > 0) {
    chrome.runtime
      .sendMessage({
        type: "RECORD_STATS",
        data: {
          scanned: totalScanned,
          hidden: hiddenCount,
          severityCounts,
          url: window.location.href,
        },
      })
      .catch(() => {});
  }

  return hiddenCount;
}

// Load options from storage
async function loadOptions() {
  try {
    const result = await chrome.storage.sync.get("coderabbitOptions");
    if (result.coderabbitOptions) {
      options = { ...options, ...result.coderabbitOptions };
    }
  } catch {
    // Use defaults
  }
}

// Listen for settings changes from popup or keyboard shortcuts
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

// Listen for options changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.coderabbitOptions) {
    options = { ...options, ...changes.coderabbitOptions.newValue };
    applyFilters();
  }
  if (changes.severitySettings) {
    currentSettings = { ...currentSettings, ...changes.severitySettings.newValue };
    applyFilters();
  }
});

// Load saved settings on page load
async function init() {
  await loadOptions();

  const result = await chrome.storage.sync.get("severitySettings");
  if (result.severitySettings) {
    currentSettings = result.severitySettings;
  }
  applyFilters();
}

init();

// Re-apply when GitHub dynamically loads content (SPA navigation, lazy-loaded comments)
const observer = new MutationObserver(() => {
  applyFilters();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});
