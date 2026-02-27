const SEVERITIES = ["nitpick", "suggestion", "warning", "issue"];
const DEFAULT_SETTINGS = { nitpick: true, suggestion: true, warning: true, issue: true };

async function loadSettings() {
  const result = await chrome.storage.sync.get("severitySettings");
  return result.severitySettings || { ...DEFAULT_SETTINGS };
}

async function saveSettings(settings) {
  await chrome.storage.sync.set({ severitySettings: settings });
}

async function notifyContentScript(settings) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "UPDATE_SEVERITY_FILTER", settings });
  }
}

async function updateHiddenCount() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await loadSettings();

  document.querySelectorAll("[data-severity]").forEach((checkbox) => {
    const severity = checkbox.dataset.severity;
    checkbox.checked = settings[severity] !== false;

    checkbox.addEventListener("change", async () => {
      settings[severity] = checkbox.checked;
      await saveSettings(settings);
      await notifyContentScript(settings);
      setTimeout(updateHiddenCount, 100);
    });
  });

  updateHiddenCount();
});
