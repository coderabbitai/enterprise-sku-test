const SEVERITIES = ["nitpick", "suggestion", "warning", "issue"];
const DEFAULT_SETTINGS = { nitpick: true, suggestion: true, warning: true, issue: true };

const BADGE_COLORS = {
  nitpick: "#818b98",
  suggestion: "#0969da",
  warning: "#bf8700",
  issue: "#cf222e",
};

async function loadSettings() {
  const result = await chrome.storage.sync.get("severitySettings");
  return result.severitySettings || { ...DEFAULT_SETTINGS };
}

async function saveSettings(settings) {
  await chrome.storage.sync.set({ severitySettings: settings });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function notifyContentScript(settings) {
  const tab = await getActiveTab();
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "UPDATE_SEVERITY_FILTER", settings });
  }
}

function announce(message) {
  const region = document.getElementById("liveRegion");
  region.textContent = message;
}

async function updateHiddenCount() {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_HIDDEN_COUNT" });
    const el = document.getElementById("hiddenCount");
    if (response && response.hiddenCount > 0) {
      const msg = `${response.hiddenCount} comment${response.hiddenCount === 1 ? "" : "s"} hidden`;
      el.textContent = msg;
      announce(msg);
    } else {
      el.textContent = "All comments visible";
      announce("All comments visible");
    }
  } catch {
    document.getElementById("hiddenCount").textContent = "Navigate to a GitHub PR to use";
  }
}

async function updateSeverityCounts() {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_SEVERITY_COUNTS" });
    if (response?.counts) {
      for (const severity of SEVERITIES) {
        const el = document.getElementById(`count-${severity}`);
        if (el) el.textContent = response.counts[severity] || 0;
      }
    }
  } catch {
    // Page not ready
  }
}

async function updateFileGroups() {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  const container = document.getElementById("fileGroupList");

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_FILE_GROUPS" });
    if (!response?.fileGroups || response.fileGroups.length === 0) {
      container.innerHTML = '<div class="file-group-empty">No CodeRabbit comments found</div>';
      return;
    }

    container.innerHTML = response.fileGroups
      .map((fg) => {
        const badges = Object.entries(fg.counts)
          .filter(([, count]) => count > 0)
          .map(
            ([severity, count]) =>
              `<span class="file-mini-badge" style="background:${BADGE_COLORS[severity]}">${count}</span>`
          )
          .join("");

        return `
          <div class="file-group-item" role="listitem" tabindex="0" data-file="${escapeAttr(fg.file)}">
            <span class="file-name" title="${escapeAttr(fg.file)}">${escapeHtml(fg.file)}</span>
            <span class="file-count-badges">${badges}</span>
          </div>`;
      })
      .join("");

    // Click to scroll to file on the page
    container.querySelectorAll(".file-group-item").forEach((item) => {
      const handler = () => {
        const file = item.dataset.file;
        chrome.tabs.sendMessage(tab.id, { type: "SCROLL_TO_FILE", file });
      };
      item.addEventListener("click", handler);
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handler();
        }
      });
    });
  } catch {
    container.innerHTML = '<div class="file-group-empty">Navigate to a GitHub PR to see file breakdown</div>';
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// ── Theme management ───────────────────────────────────────────────────

async function loadTheme() {
  const result = await chrome.storage.sync.get("theme");
  return result.theme || "system";
}

async function saveTheme(theme) {
  await chrome.storage.sync.set({ theme });
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }

  const icon = document.getElementById("themeIcon");
  const btn = document.getElementById("themeToggle");
  if (theme === "dark") {
    icon.innerHTML = "&#9788;"; // sun
    btn.setAttribute("aria-label", "Switch to light mode");
  } else if (theme === "light") {
    icon.innerHTML = "&#9790;"; // moon
    btn.setAttribute("aria-label", "Switch to dark mode");
  } else {
    icon.innerHTML = "&#9790;";
    btn.setAttribute("aria-label", "Switch to dark mode");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // Theme
  let currentTheme = await loadTheme();
  applyTheme(currentTheme);

  document.getElementById("themeToggle").addEventListener("click", async () => {
    // Cycle: system -> dark -> light -> system
    const order = ["system", "dark", "light"];
    const idx = order.indexOf(currentTheme);
    currentTheme = order[(idx + 1) % order.length];
    await saveTheme(currentTheme);
    applyTheme(currentTheme);
    // Also tell content script about theme
    const tab = await getActiveTab();
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: "SET_THEME", theme: currentTheme });
    }
  });

  // Severity toggles
  const settings = await loadSettings();

  document.querySelectorAll("[data-severity]").forEach((checkbox) => {
    const severity = checkbox.dataset.severity;
    checkbox.checked = settings[severity] !== false;

    checkbox.addEventListener("change", async () => {
      settings[severity] = checkbox.checked;
      await saveSettings(settings);
      await notifyContentScript(settings);
      setTimeout(() => {
        updateHiddenCount();
        updateSeverityCounts();
        updateFileGroups();
      }, 100);
    });
  });

  // Quick actions
  document.getElementById("showAll").addEventListener("click", async () => {
    for (const s of SEVERITIES) settings[s] = true;
    document.querySelectorAll("[data-severity]").forEach((cb) => (cb.checked = true));
    await saveSettings(settings);
    await notifyContentScript(settings);
    setTimeout(() => { updateHiddenCount(); updateSeverityCounts(); updateFileGroups(); }, 100);
  });

  document.getElementById("hideAll").addEventListener("click", async () => {
    for (const s of SEVERITIES) settings[s] = false;
    document.querySelectorAll("[data-severity]").forEach((cb) => (cb.checked = false));
    await saveSettings(settings);
    await notifyContentScript(settings);
    setTimeout(() => { updateHiddenCount(); updateSeverityCounts(); updateFileGroups(); }, 100);
  });

  document.getElementById("issuesOnly").addEventListener("click", async () => {
    for (const s of SEVERITIES) settings[s] = s === "issue";
    document.querySelectorAll("[data-severity]").forEach((cb) => {
      cb.checked = cb.dataset.severity === "issue";
    });
    await saveSettings(settings);
    await notifyContentScript(settings);
    setTimeout(() => { updateHiddenCount(); updateSeverityCounts(); updateFileGroups(); }, 100);
  });

  updateHiddenCount();
  updateSeverityCounts();
  updateFileGroups();
});
