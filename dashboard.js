const SEVERITY_COLORS = {
  nitpick: "#818b98",
  suggestion: "#0969da",
  warning: "#bf8700",
  issue: "#cf222e",
};

const SEVERITY_LABELS = {
  nitpick: "Nitpick",
  suggestion: "Suggestion",
  warning: "Warning",
  issue: "Issue",
};

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function fetchStats() {
  return chrome.runtime.sendMessage({ type: "GET_STATS" });
}

function renderSummaryCards(stats) {
  document.getElementById("totalScanned").textContent =
    stats.totalScanned.toLocaleString();
  document.getElementById("totalHidden").textContent =
    stats.totalHidden.toLocaleString();
  document.getElementById("repoCount").textContent = Object.keys(
    stats.byRepo || {}
  ).length;

  const rate =
    stats.totalScanned > 0
      ? Math.round((stats.totalHidden / stats.totalScanned) * 100)
      : 0;
  document.getElementById("filterRate").textContent = `${rate}%`;
}

function renderPieChart(stats) {
  const pieEl = document.getElementById("pieChart");
  const legendEl = document.getElementById("pieLegend");
  const counts = stats.bySeverity || {};
  const total = Object.values(counts).reduce((s, v) => s + v, 0);

  if (total === 0) {
    pieEl.style.background = "#eaeef2";
    legendEl.innerHTML =
      '<span style="color: #656d76; font-size: 13px;">No data yet</span>';
    return;
  }

  // Build conic gradient
  const segments = [];
  let cumulative = 0;
  for (const [severity, color] of Object.entries(SEVERITY_COLORS)) {
    const count = counts[severity] || 0;
    const pct = (count / total) * 100;
    segments.push(`${color} ${cumulative}% ${cumulative + pct}%`);
    cumulative += pct;
  }
  pieEl.style.background = `conic-gradient(${segments.join(", ")})`;

  // Legend
  legendEl.innerHTML = Object.entries(SEVERITY_COLORS)
    .map(([severity, color]) => {
      const count = counts[severity] || 0;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      return `
      <div class="legend-item">
        <div class="legend-dot ${severity}"></div>
        <span>${SEVERITY_LABELS[severity]}: ${count.toLocaleString()} (${pct}%)</span>
      </div>
    `;
    })
    .join("");
}

function renderBarChart(stats) {
  const container = document.getElementById("barChart");
  const counts = stats.bySeverity || {};
  const max = Math.max(1, ...Object.values(counts));

  container.innerHTML = Object.entries(SEVERITY_COLORS)
    .map(([severity]) => {
      const count = counts[severity] || 0;
      const widthPct = (count / max) * 100;
      return `
      <div class="bar-row">
        <span class="bar-label">${SEVERITY_LABELS[severity]}</span>
        <div class="bar-track">
          <div class="bar-fill ${severity}" style="width: ${widthPct}%"></div>
        </div>
        <span class="bar-count">${count.toLocaleString()}</span>
      </div>
    `;
    })
    .join("");
}

function renderRepoTable(stats) {
  const container = document.getElementById("repoSection");
  const repos = Object.entries(stats.byRepo || {});

  if (repos.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No repository data collected yet. Visit a GitHub PR to start tracking.</p>
      </div>
    `;
    return;
  }

  repos.sort(([, a], [, b]) => b.scanned - a.scanned);

  const maxScanned = Math.max(1, ...repos.map(([, r]) => r.scanned));

  container.innerHTML = `
    <table class="repo-table">
      <thead>
        <tr>
          <th>Repository</th>
          <th class="num">Scanned</th>
          <th class="num">Hidden</th>
          <th class="num">Rate</th>
          <th style="width: 120px;">Activity</th>
        </tr>
      </thead>
      <tbody>
        ${repos
          .map(([name, data]) => {
            const rate =
              data.scanned > 0
                ? Math.round((data.hidden / data.scanned) * 100)
                : 0;
            const barWidth = (data.scanned / maxScanned) * 100;
            return `
            <tr>
              <td class="repo-name">${escapeHtml(name)}</td>
              <td class="num">${data.scanned.toLocaleString()}</td>
              <td class="num">${data.hidden.toLocaleString()}</td>
              <td class="num">${rate}%</td>
              <td>
                <div style="background: #eaeef2; border-radius: 3px; height: 6px;">
                  <div class="mini-bar" style="width: ${barWidth}%; background: #0969da;"></div>
                </div>
              </td>
            </tr>
          `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderLastUpdated(stats) {
  const el = document.getElementById("lastUpdated");
  if (stats.lastUpdated) {
    const d = new Date(stats.lastUpdated);
    el.textContent = `Last updated: ${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  } else {
    el.textContent = "";
  }
}

async function render() {
  try {
    const stats = await fetchStats();
    renderSummaryCards(stats);
    renderPieChart(stats);
    renderBarChart(stats);
    renderRepoTable(stats);
    renderLastUpdated(stats);
  } catch (err) {
    console.error("Failed to load stats:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  render();

  document.getElementById("refreshBtn").addEventListener("click", render);

  document.getElementById("resetBtn").addEventListener("click", async () => {
    if (confirm("Are you sure you want to reset all statistics?")) {
      await chrome.runtime.sendMessage({ type: "RESET_STATS" });
      render();
    }
  });

  document.getElementById("exportBtn").addEventListener("click", async () => {
    const stats = await fetchStats();
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
});
