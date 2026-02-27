const OPTIONS_KEY = "coderabbitOptions";

const DEFAULT_OPTIONS = {
  autoCollapse: false,
  showBadge: true,
  trackStats: true,
  defaultFilter: "all",
};

async function loadOptions() {
  const result = await chrome.storage.sync.get(OPTIONS_KEY);
  return { ...DEFAULT_OPTIONS, ...result[OPTIONS_KEY] };
}

async function saveOptions(options) {
  await chrome.storage.sync.set({ [OPTIONS_KEY]: options });
  showToast("Settings saved");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 2000);
}

async function renderRepoStats() {
  const container = document.getElementById("repoList");

  try {
    const stats = await chrome.runtime.sendMessage({ type: "GET_STATS" });

    if (!stats || !stats.byRepo || Object.keys(stats.byRepo).length === 0) {
      container.innerHTML = '<p class="description">No repository data collected yet.</p>';
      return;
    }

    const repos = Object.entries(stats.byRepo).sort(
      ([, a], [, b]) => b.scanned - a.scanned
    );

    container.innerHTML = repos
      .map(
        ([name, data]) => `
      <div class="repo-item">
        <span class="repo-name">${escapeHtml(name)}</span>
        <span class="repo-stats">${data.scanned} scanned, ${data.hidden} hidden</span>
      </div>
    `
      )
      .join("");
  } catch {
    container.innerHTML = '<p class="description">Could not load statistics.</p>';
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", async () => {
  const options = await loadOptions();

  // Bind toggle inputs
  const toggles = ["autoCollapse", "showBadge", "trackStats"];
  for (const key of toggles) {
    const el = document.getElementById(key);
    el.checked = options[key];
    el.addEventListener("change", async () => {
      options[key] = el.checked;
      await saveOptions(options);
    });
  }

  // Bind select
  const filterSelect = document.getElementById("defaultFilter");
  filterSelect.value = options.defaultFilter;
  filterSelect.addEventListener("change", async () => {
    options.defaultFilter = filterSelect.value;
    await saveOptions(options);
  });

  // Reset stats button
  document.getElementById("resetStats").addEventListener("click", async () => {
    if (confirm("Are you sure you want to reset all statistics?")) {
      await chrome.runtime.sendMessage({ type: "RESET_STATS" });
      showToast("Statistics reset");
      renderRepoStats();
    }
  });

  // Export stats button
  document.getElementById("exportStats").addEventListener("click", async () => {
    const stats = await chrome.runtime.sendMessage({ type: "GET_STATS" });
    const blob = new Blob([JSON.stringify(stats, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coderabbit-stats-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  renderRepoStats();
});
