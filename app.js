const STATE = {
  board: "allTime",
  sort: "rank",
  query: "",
  current: null,
  history: null
};

function fmtDate(ts) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("zh-CN", { hour12: false });
}

function heatText(item) {
  const h = item.heat || {};
  return `
    <div>综合热度: <b>${(h.totalHeat || 0).toFixed(1)}</b></div>
    <div>All Time: ${h.allTimeRaw || "-"}</div>
    <div>Trending: ${h.trendingRaw || "-"}</div>
    <div>Hot(+1h): ${h.hotRaw || "-"}</div>
  `;
}

function renderCard(item, board, dropped = false) {
  const rank = item.ranks?.[board];
  const rankText = dropped ? "已掉榜" : (rank ? `#${rank}` : "-");
  const scenarios = (item.scenarios || []).slice(0, 2).join(" / ");
  const audience = (item.audience || []).slice(0, 2).join(" / ");
  return `
    <article class="card">
      <div class="top">
        <div>
          <div class="title">${item.name}</div>
          <div class="vendor">${item.owner}/${item.repo} · ${item.vendor}</div>
        </div>
        <div class="rank">${rankText}</div>
      </div>
      <div class="uses">${item.uses || "暂无用途描述"}</div>
      <div class="tags">
        <span class="tag">适合人群: ${audience || "通用"}</span>
        <span class="tag">适合场景: ${scenarios || "通用"}</span>
      </div>
      <div class="heat">${heatText(item)}</div>
    </article>
  `;
}

function filterAndSort(list) {
  const q = STATE.query.trim().toLowerCase();
  let result = list.filter((it) => {
    const text = [
      it.name,
      it.owner,
      it.repo,
      it.vendor,
      it.uses,
      ...(it.audience || []),
      ...(it.scenarios || [])
    ].join(" ").toLowerCase();
    return !q || text.includes(q);
  });

  if (STATE.sort === "name") {
    result.sort((a, b) => a.name.localeCompare(b.name));
  } else if (STATE.sort === "heat") {
    result.sort((a, b) => (b.heat?.totalHeat || 0) - (a.heat?.totalHeat || 0));
  } else {
    result.sort((a, b) => (a.ranks?.[STATE.board] || 9999) - (b.ranks?.[STATE.board] || 9999));
  }
  return result;
}

function renderStats() {
  const boardData = STATE.current.boards[STATE.board];
  const droppedCount = (STATE.history.droppedSkills || []).length;
  const statsBar = document.getElementById("statsBar");
  statsBar.innerHTML = `
    <div class="stat-item"><div class="label">当前榜单</div><div class="value">${boardData.label}</div></div>
    <div class="stat-item"><div class="label">前100数量</div><div class="value">${boardData.skills.length}</div></div>
    <div class="stat-item"><div class="label">历史收录</div><div class="value">${Object.keys(STATE.history.registry || {}).length}</div></div>
    <div class="stat-item"><div class="label">掉榜数量</div><div class="value">${droppedCount}</div></div>
  `;
}

function topEntriesFromMap(mapObj, limit = 6) {
  return Object.entries(mapObj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function renderInsights(list) {
  const vendorMap = {};
  const scenarioMap = {};
  list.forEach((item) => {
    const v = item.vendor || "Unknown";
    vendorMap[v] = (vendorMap[v] || 0) + 1;
    (item.scenarios || ["通用效率提升"]).forEach((sc) => {
      scenarioMap[sc] = (scenarioMap[sc] || 0) + 1;
    });
  });

  const vendorRows = topEntriesFromMap(vendorMap).map(([name, count]) => (
    `<div class="insight-row"><span>${name}</span><span class="count">${count}</span></div>`
  )).join("");
  const scenarioRows = topEntriesFromMap(scenarioMap).map(([name, count]) => (
    `<div class="insight-row"><span>${name}</span><span class="count">${count}</span></div>`
  )).join("");

  document.getElementById("vendorBoard").innerHTML = vendorRows || '<div class="insight-row"><span>暂无</span><span class="count">0</span></div>';
  document.getElementById("scenarioBoard").innerHTML = scenarioRows || '<div class="insight-row"><span>暂无</span><span class="count">0</span></div>';
}

function render() {
  const boardData = STATE.current.boards[STATE.board];
  const visibleCurrent = filterAndSort(boardData.skills);
  const currentGrid = document.getElementById("currentGrid");
  currentGrid.innerHTML = visibleCurrent.map((it) => renderCard(it, STATE.board)).join("");

  const dropped = filterAndSort(STATE.history.droppedSkills || []);
  const droppedGrid = document.getElementById("droppedGrid");
  droppedGrid.innerHTML = dropped.map((it) => renderCard(it, STATE.board, true)).join("");
  renderStats();
  renderInsights(boardData.skills);
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((n) => n.classList.remove("active"));
      tab.classList.add("active");
      STATE.board = tab.dataset.board;
      render();
    });
  });
  document.getElementById("searchInput").addEventListener("input", (e) => {
    STATE.query = e.target.value;
    render();
  });
  document.getElementById("sortSelect").addEventListener("change", (e) => {
    STATE.sort = e.target.value;
    render();
  });
}

async function boot() {
  if (window.__SKILLS_CURRENT__ && window.__SKILLS_HISTORY__) {
    STATE.current = window.__SKILLS_CURRENT__;
    STATE.history = window.__SKILLS_HISTORY__;
  } else {
    const [currentResp, historyResp] = await Promise.all([
      fetch("./data/skills-current.json"),
      fetch("./data/skills-history.json")
    ]);
    STATE.current = await currentResp.json();
    STATE.history = await historyResp.json();
  }
  document.getElementById("metaText").textContent = `数据更新时间: ${fmtDate(STATE.current.generatedAt)} | 口径: 前100 + 掉榜沉淀`;
  bindEvents();
  render();
}

boot().catch((err) => {
  document.getElementById("metaText").textContent = `加载失败: ${err.message}`;
});
