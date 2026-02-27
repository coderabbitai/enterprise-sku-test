const CODERABBIT_USERNAME = "coderabbitai";

const SEVERITY_PATTERNS = {
  nitpick: /\[nitpick\]/i,
  suggestion: /\[suggestion\]/i,
  warning: /\[warning\]/i,
  issue: /\[issue\]/i,
};

let currentSettings = { nitpick: true, suggestion: true, warning: true, issue: true };
let currentSearchQuery = "";
let widgetVisible = true;

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

// ── Extract structured comment data ────────────────────────────────────

function extractCommentData(commentEl) {
  const body = getCommentBody(commentEl);
  if (!body) return null;

  const severity = detectSeverity(commentEl);
  const text = body.textContent.trim();
  const html = body.innerHTML;

  // Try to find the file path this comment is about
  const fileHeader = commentEl.closest(".js-resolvable-timeline-thread-container");
  const filePath = fileHeader?.querySelector(".file-info a, .file-header a")?.textContent?.trim() || "";

  // Try to extract line number
  const lineEl = commentEl.closest("tr")?.querySelector("td.blob-num");
  const lineNumber = lineEl?.textContent?.trim() || "";

  return { severity, text, html, filePath, lineNumber };
}

function getVisibleComments() {
  const comments = [];
  getCommentElements().forEach((el) => {
    if (!isCodeRabbitComment(el)) return;
    const data = extractCommentData(el);
    if (!data || !data.severity) return;
    if (currentSettings[data.severity] === false) return;
    comments.push(data);
  });
  return comments;
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

// ── Text search / highlight ────────────────────────────────────────────

function clearHighlights() {
  document.querySelectorAll(".coderabbit-search-highlight").forEach((el) => {
    const parent = el.parentNode;
    parent.replaceChild(document.createTextNode(el.textContent), el);
    parent.normalize();
  });
}

function highlightText(rootEl, query) {
  if (!query) return 0;

  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
  const matches = [];
  const lowerQuery = query.toLowerCase();

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const idx = node.textContent.toLowerCase().indexOf(lowerQuery);
    if (idx !== -1) {
      matches.push({ node, idx });
    }
  }

  // Apply highlights in reverse to avoid offset issues
  for (let i = matches.length - 1; i >= 0; i--) {
    const { node, idx } = matches[i];
    const range = document.createRange();
    range.setStart(node, idx);
    range.setEnd(node, idx + query.length);

    const span = document.createElement("span");
    span.className = "coderabbit-search-highlight";
    range.surroundContents(span);
  }

  return matches.length;
}

function applySearch(query) {
  clearHighlights();
  if (!query) return 0;

  let totalMatches = 0;
  getCommentElements().forEach((el) => {
    if (!isCodeRabbitComment(el)) return;
    const body = getCommentBody(el);
    if (!body) return;
    totalMatches += highlightText(body, query);
  });
  return totalMatches;
}

// ── Export formatters ──────────────────────────────────────────────────

function exportAsMarkdown(comments) {
  const lines = ["# CodeRabbit Review Comments", ""];
  const grouped = {};

  for (const c of comments) {
    const key = c.filePath || "(general)";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(c);
  }

  for (const [file, fileComments] of Object.entries(grouped)) {
    lines.push(`## ${file}`);
    lines.push("");
    for (const c of fileComments) {
      const line = c.lineNumber ? ` (line ${c.lineNumber})` : "";
      lines.push(`### [${c.severity}]${line}`);
      lines.push("");
      lines.push(c.text);
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  }

  return lines.join("\n");
}

function exportAsJson(comments) {
  const data = comments.map((c) => ({
    severity: c.severity,
    file: c.filePath || null,
    line: c.lineNumber || null,
    text: c.text,
  }));
  return JSON.stringify(data, null, 2);
}

function exportAsCsv(comments) {
  const escape = (str) => `"${str.replace(/"/g, '""').replace(/\n/g, " ")}"`;
  const rows = [["severity", "file", "line", "text"].join(",")];

  for (const c of comments) {
    rows.push(
      [
        escape(c.severity),
        escape(c.filePath || ""),
        escape(c.lineNumber || ""),
        escape(c.text),
      ].join(",")
    );
  }

  return rows.join("\n");
}

// ── Floating summary widget ────────────────────────────────────────────

const WIDGET_ID = "coderabbit-summary-widget";

function createWidget() {
  let widget = document.getElementById(WIDGET_ID);
  if (widget) return widget;

  widget = document.createElement("div");
  widget.id = WIDGET_ID;
  widget.innerHTML = `
    <div class="crw-header">
      <span class="crw-title">CodeRabbit</span>
      <button class="crw-close" title="Close">&times;</button>
    </div>
    <div class="crw-body">
      <div class="crw-row"><span class="crw-dot crw-dot-nitpick"></span> Nitpick: <strong id="crw-nitpick">0</strong></div>
      <div class="crw-row"><span class="crw-dot crw-dot-suggestion"></span> Suggestion: <strong id="crw-suggestion">0</strong></div>
      <div class="crw-row"><span class="crw-dot crw-dot-warning"></span> Warning: <strong id="crw-warning">0</strong></div>
      <div class="crw-row"><span class="crw-dot crw-dot-issue"></span> Issue: <strong id="crw-issue">0</strong></div>
      <div class="crw-divider"></div>
      <div class="crw-row crw-total">Total: <strong id="crw-total">0</strong> &middot; Hidden: <strong id="crw-hidden">0</strong></div>
    </div>
  `;

  widget.querySelector(".crw-close").addEventListener("click", () => {
    widget.style.display = "none";
    chrome.storage.sync.set({ showWidget: false });
  });

  // Make draggable
  let isDragging = false;
  let offsetX, offsetY;
  const header = widget.querySelector(".crw-header");

  header.addEventListener("mousedown", (e) => {
    isDragging = true;
    offsetX = e.clientX - widget.getBoundingClientRect().left;
    offsetY = e.clientY - widget.getBoundingClientRect().top;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    widget.style.right = "auto";
    widget.style.bottom = "auto";
    widget.style.left = `${e.clientX - offsetX}px`;
    widget.style.top = `${e.clientY - offsetY}px`;
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
  });

  document.body.appendChild(widget);
  return widget;
}

function updateWidget(counts, hiddenCount) {
  if (!widgetVisible) return;

  const widget = createWidget();
  widget.style.display = "";

  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  document.getElementById("crw-nitpick").textContent = counts.nitpick;
  document.getElementById("crw-suggestion").textContent = counts.suggestion;
  document.getElementById("crw-warning").textContent = counts.warning;
  document.getElementById("crw-issue").textContent = counts.issue;
  document.getElementById("crw-total").textContent = total;
  document.getElementById("crw-hidden").textContent = hiddenCount;
}

function hideWidget() {
  const widget = document.getElementById(WIDGET_ID);
  if (widget) widget.style.display = "none";
}

// ── Core filter logic ──────────────────────────────────────────────────

function applyFilters() {
  let hiddenCount = 0;

  getCommentElements().forEach((el) => {
    if (!isCodeRabbitComment(el)) return;

    const severity = detectSeverity(el);
    if (!severity) return;

    const shouldShow = currentSettings[severity] !== false;

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

  // Update floating widget
  const counts = countSeverities();
  updateWidget(counts, hiddenCount);

  // Re-apply search highlights
  if (currentSearchQuery) {
    applySearch(currentSearchQuery);
  }

  return hiddenCount;
}

// ── Message handling ───────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case "UPDATE_SEVERITY_FILTER":
      currentSettings = message.settings;
      applyFilters();
      sendResponse({ ok: true });
      break;

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

    case "SEARCH_COMMENTS": {
      currentSearchQuery = message.query || "";
      const matchCount = applySearch(currentSearchQuery);
      sendResponse({ matchCount });
      break;
    }

    case "EXPORT_COMMENTS": {
      const comments = getVisibleComments();
      let data = "";
      switch (message.format) {
        case "markdown":
          data = exportAsMarkdown(comments);
          break;
        case "json":
          data = exportAsJson(comments);
          break;
        case "csv":
          data = exportAsCsv(comments);
          break;
      }
      sendResponse({ data });
      break;
    }

    case "TOGGLE_WIDGET":
      widgetVisible = message.visible;
      if (widgetVisible) {
        applyFilters(); // will create/show widget
      } else {
        hideWidget();
      }
      sendResponse({ ok: true });
      break;
  }

  return true;
});

// ── Initialization ─────────────────────────────────────────────────────

async function init() {
  // Load widget preference
  try {
    const result = await chrome.storage.sync.get("showWidget");
    widgetVisible = result.showWidget !== false;
  } catch {
    // defaults
  }

  // Load severity settings
  chrome.storage.sync.get("severitySettings", (result) => {
    if (result.severitySettings) {
      currentSettings = result.severitySettings;
    }
    applyFilters();
  });
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
