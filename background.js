// Background service worker for tracking CodeRabbit comment statistics across PRs

const STATS_KEY = "coderabbitStats";

const DEFAULT_STATS = {
  totalScanned: 0,
  totalHidden: 0,
  bySeverity: { nitpick: 0, suggestion: 0, warning: 0, issue: 0 },
  byRepo: {},
  lastUpdated: null,
};

async function getStats() {
  const result = await chrome.storage.local.get(STATS_KEY);
  return result[STATS_KEY] || structuredClone(DEFAULT_STATS);
}

async function saveStats(stats) {
  stats.lastUpdated = new Date().toISOString();
  await chrome.storage.local.set({ [STATS_KEY]: stats });
}

async function resetStats() {
  await chrome.storage.local.set({ [STATS_KEY]: structuredClone(DEFAULT_STATS) });
}

function extractRepoFromUrl(url) {
  const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
  return match ? match[1] : null;
}

// Update badge with hidden comment count
async function updateBadge(tabId, hiddenCount) {
  const text = hiddenCount > 0 ? String(hiddenCount) : "";
  const color = hiddenCount > 0 ? "#cf222e" : "#1a7f37";

  await chrome.action.setBadgeText({ text, tabId });
  await chrome.action.setBadgeBackgroundColor({ color, tabId });
}

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RECORD_STATS") {
    (async () => {
      const stats = await getStats();
      const { scanned, hidden, severityCounts, url } = message.data;

      stats.totalScanned += scanned;
      stats.totalHidden += hidden;

      for (const [severity, count] of Object.entries(severityCounts)) {
        stats.bySeverity[severity] = (stats.bySeverity[severity] || 0) + count;
      }

      const repo = extractRepoFromUrl(url || "");
      if (repo) {
        if (!stats.byRepo[repo]) {
          stats.byRepo[repo] = { scanned: 0, hidden: 0 };
        }
        stats.byRepo[repo].scanned += scanned;
        stats.byRepo[repo].hidden += hidden;
      }

      await saveStats(stats);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === "GET_STATS") {
    getStats().then((stats) => sendResponse(stats));
    return true;
  }

  if (message.type === "RESET_STATS") {
    resetStats().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "UPDATE_BADGE") {
    const tabId = sender.tab?.id;
    if (tabId) {
      updateBadge(tabId, message.hiddenCount);
    }
    sendResponse({ ok: true });
    return true;
  }
});

// Handle keyboard shortcut commands
chrome.commands.onCommand.addListener(async (command) => {
  if (!command.startsWith("toggle-")) return;

  const severity = command.replace("toggle-", "");
  const result = await chrome.storage.sync.get("severitySettings");
  const settings = result.severitySettings || {
    nitpick: true,
    suggestion: true,
    warning: true,
    issue: true,
  };

  settings[severity] = !settings[severity];
  await chrome.storage.sync.set({ severitySettings: settings });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: "UPDATE_SEVERITY_FILTER",
      settings,
    });
  }
});

// Set default badge on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: "" });
});
