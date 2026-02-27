const SEVERITIES = ["nitpick", "suggestion", "warning", "issue"];
const DEFAULT_SETTINGS = { nitpick: true, suggestion: true, warning: true, issue: true };

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

async function updateHiddenCount() {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_HIDDEN_COUNT" });
    const el = document.getElementById("hiddenCount");
    if (response && response.hiddenCount > 0) {
      el.textContent = `${response.hiddenCount} comment${response.hiddenCount === 1 ? "" : "s"} hidden`;
    } else {
      el.textContent = "All comments visible";
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
    if (response && response.counts) {
      for (const severity of SEVERITIES) {
        const el = document.getElementById(`count-${severity}`);
        if (el) {
          el.textContent = response.counts[severity] || 0;
        }
      }
    }
  } catch {
    // Page not ready yet
  }
}

async function sendSearch(query) {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "SEARCH_COMMENTS",
      query,
    });
    const hint = document.getElementById("searchHint");
    if (response) {
      if (query.length === 0) {
        hint.textContent = "";
      } else if (response.matchCount > 0) {
        hint.textContent = `${response.matchCount} match${response.matchCount === 1 ? "" : "es"} found`;
      } else {
        hint.textContent = "No matches found";
      }
    }
  } catch {
    // Page not ready
  }
}

async function requestExport(format) {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "EXPORT_COMMENTS",
      format,
    });
    if (response && response.data) {
      const mimeTypes = {
        markdown: "text/markdown",
        json: "application/json",
        csv: "text/csv",
      };
      const extensions = { markdown: "md", json: "json", csv: "csv" };

      const blob = new Blob([response.data], { type: mimeTypes[format] });
      const url = URL.createObjectURL(blob);

      // Use downloads API
      chrome.downloads.download({
        url,
        filename: `coderabbit-comments.${extensions[format]}`,
        saveAs: true,
      });
    }
  } catch {
    // Page not ready
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await loadSettings();

  // Severity toggles
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
      }, 100);
    });
  });

  // Search input with debounce
  let searchTimeout;
  document.getElementById("searchInput").addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => sendSearch(e.target.value.trim()), 200);
  });

  // Quick action buttons
  document.getElementById("showAll").addEventListener("click", async () => {
    for (const s of SEVERITIES) settings[s] = true;
    document.querySelectorAll("[data-severity]").forEach((cb) => (cb.checked = true));
    await saveSettings(settings);
    await notifyContentScript(settings);
    setTimeout(() => { updateHiddenCount(); updateSeverityCounts(); }, 100);
  });

  document.getElementById("hideAll").addEventListener("click", async () => {
    for (const s of SEVERITIES) settings[s] = false;
    document.querySelectorAll("[data-severity]").forEach((cb) => (cb.checked = false));
    await saveSettings(settings);
    await notifyContentScript(settings);
    setTimeout(() => { updateHiddenCount(); updateSeverityCounts(); }, 100);
  });

  document.getElementById("issuesOnly").addEventListener("click", async () => {
    for (const s of SEVERITIES) settings[s] = s === "issue";
    document.querySelectorAll("[data-severity]").forEach((cb) => {
      cb.checked = cb.dataset.severity === "issue";
    });
    await saveSettings(settings);
    await notifyContentScript(settings);
    setTimeout(() => { updateHiddenCount(); updateSeverityCounts(); }, 100);
  });

  // Widget toggle
  const widgetToggle = document.getElementById("widgetToggle");
  const widgetResult = await chrome.storage.sync.get("showWidget");
  widgetToggle.checked = widgetResult.showWidget !== false;
  widgetToggle.addEventListener("change", async () => {
    await chrome.storage.sync.set({ showWidget: widgetToggle.checked });
    const tab = await getActiveTab();
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: "TOGGLE_WIDGET",
        visible: widgetToggle.checked,
      });
    }
  });

  // Export buttons
  document.querySelectorAll("[data-format]").forEach((btn) => {
    btn.addEventListener("click", () => requestExport(btn.dataset.format));
  });

  updateHiddenCount();
  updateSeverityCounts();
});
