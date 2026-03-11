const STATE = {
  board: "allTime",
  sort: "rank",
  query: "",
  activeVendor: "",
  activeScenario: "",
  current: null,
  history: null
};

function applySavedTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "dark" || saved === "light") {
    document.documentElement.dataset.theme = saved;
  }
}

function bindThemeToggle() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  function syncLabel() {
    const isDark = document.documentElement.dataset.theme !== "light";
    btn.textContent = isDark ? "🌙 Dark" : "☀️ Light";
  }
  btn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    syncLabel();
  });
  syncLabel();
}

function fmtDate(ts) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("zh-CN", { hour12: false });
}

function heatText(item) {
  const h = item.heat || {};
  function level(score) {
    if (score >= 75) return { label: "特别热", cls: "lv-super" };
    if (score >= 50) return { label: "热门", cls: "lv-hot" };
    if (score >= 30) return { label: "良好", cls: "lv-good" };
    if (score >= 15) return { label: "中等", cls: "lv-mid" };
    return { label: "偏冷", cls: "lv-cold" };
  }
  function row(label, raw, score) {
    const lv = level(score || 0);
    return `
      <div class="metric">
        <div class="metric-head">
          <span>${label}: ${raw || "-"}</span>
          <span class="metric-level ${lv.cls}">${lv.label}</span>
        </div>
        <div class="metric-bar">
          <span class="metric-fill ${lv.cls}" style="width:${Math.max(2, score || 0)}%"></span>
        </div>
      </div>
    `;
  }
  return `
    <div class="heat-total">综合热度: <b>${(h.totalHeat || 0).toFixed(1)}</b></div>
    ${row("All Time", h.allTimeRaw, h.allTimeScore)}
    ${row("Trending", h.trendingRaw, h.trendingScore)}
    ${row("Hot(+1h)", h.hotRaw, h.hotScore)}
  `;
}

function renderPersonaTags(item) {
  const audienceMap = {
    "设计师": ["🎨", "tag-purple"],
    "前端工程师": ["💻", "tag-blue"],
    "增长运营": ["📈", "tag-orange"],
    "后端/平台工程师": ["🛠️", "tag-cyan"],
    "研发团队": ["🧪", "tag-green"],
    "内容团队": ["📝", "tag-pink"],
    "AI 工作者": ["🤖", "tag-gray"]
  };
  const sceneMap = {
    "界面设计": ["🖼️", "tag-purple"],
    "代码开发": ["⚙️", "tag-blue"],
    "增长实验": ["🚀", "tag-orange"],
    "云与基础设施": ["☁️", "tag-cyan"],
    "质量保障": ["✅", "tag-green"],
    "内容生产": ["📚", "tag-pink"],
    "通用效率提升": ["✨", "tag-gray"]
  };
  const audience = (item.audience || []).slice(0, 3).map((name) => {
    const [emoji, cls] = audienceMap[name] || ["👤", "tag-gray"];
    return `<span class="tag ${cls}">${emoji} ${name}</span>`;
  }).join("");
  const scenes = (item.scenarios || []).slice(0, 3).map((name) => {
    const [emoji, cls] = sceneMap[name] || ["📍", "tag-gray"];
    return `<span class="tag ${cls}">${emoji} ${name}</span>`;
  }).join("");
  return `
    <div class="tag-group"><div class="tag-caption">适合人群</div>${audience}</div>
    <div class="tag-group"><div class="tag-caption">适合场景</div>${scenes}</div>
  `;
}

function renderCard(item, board, dropped = false) {
  const rank = item.ranks?.[board];
  const rankText = dropped ? "已掉榜" : (rank ? `#${rank}` : "-");
  const hasUseCases = Array.isArray(item.useCases) && item.useCases.length > 0;
  const isOfficial = !String(item.uses || "").includes("暂无官方描述");
  const qualityLabel = hasUseCases ? "官方场景驱动" : (isOfficial ? "官方摘要" : "语义推断");
  const qualityClass = hasUseCases ? "quality-high" : (isOfficial ? "quality-mid" : "quality-low");
  return `
    <article class="card">
      <div class="top">
        <div>
          <div class="title">${item.nameZh || item.name}</div>
          <div class="title-en">${item.nameEn || item.name}</div>
          <div class="vendor">${item.owner}/${item.repo} · ${item.vendor}</div>
          <div class="quality-badge ${qualityClass}">${qualityLabel}</div>
        </div>
        <div class="rank">${rankText}</div>
      </div>
      <div class="uses">${item.introZh || "暂无中文解读"}</div>
      <div class="tags tags-strong">
        ${renderPersonaTags(item)}
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
      it.introZh,
      it.nameZh,
      ...(it.audience || []),
      ...(it.scenarios || [])
    ].join(" ").toLowerCase();
    const matchQuery = !q || text.includes(q);
    const matchVendor = !STATE.activeVendor || it.vendor === STATE.activeVendor;
    const matchScenario = !STATE.activeScenario || (it.scenarios || []).includes(STATE.activeScenario);
    return matchQuery && matchVendor && matchScenario;
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

function renderVisualPanel(list) {
  const panel = document.getElementById("vizPanel");
  if (!panel) return;
  const boardData = STATE.current.boards[STATE.board];
  const droppedCount = (STATE.history.droppedSkills || []).length;
  const visibleCount = list.length;
  const historyCount = Object.keys(STATE.history.registry || {}).length;
  const buckets = [
    { key: "super", label: "特别热", cls: "lv-super", test: (v) => v >= 75 },
    { key: "hot", label: "热门", cls: "lv-hot", test: (v) => v >= 50 && v < 75 },
    { key: "good", label: "良好", cls: "lv-good", test: (v) => v >= 30 && v < 50 },
    { key: "mid", label: "中等", cls: "lv-mid", test: (v) => v >= 15 && v < 30 },
    { key: "cold", label: "偏冷", cls: "lv-cold", test: (v) => v < 15 }
  ];
  const total = Math.max(1, list.length);
  const avgHeat = list.reduce((sum, it) => sum + (it.heat?.totalHeat || 0), 0) / total;
  const maxHeat = list.reduce((m, it) => Math.max(m, it.heat?.totalHeat || 0), 0);
  const rows = buckets.map((b) => {
    const count = list.filter((it) => b.test(it.heat?.totalHeat || 0)).length;
    const pct = (count / total) * 100;
    return `
      <div class="viz-row">
        <div class="viz-name">${b.label}</div>
        <div class="viz-bar"><span class="viz-fill ${b.cls}" style="width:${Math.max(2, pct)}%"></span></div>
        <div class="viz-count">${count}</div>
      </div>
    `;
  }).join("");

  panel.innerHTML = `
    <div class="viz-card viz-card-main">
      <div class="viz-top-metrics">
        <span class="mini-kpi"><em>榜单</em><b>${boardData.label}</b></span>
        <span class="mini-kpi"><em>前100</em><b>${boardData.skills.length}</b></span>
        <span class="mini-kpi"><em>历史收录</em><b>${historyCount}</b></span>
        <span class="mini-kpi"><em>掉榜</em><b>${droppedCount}</b></span>
        <span class="mini-kpi"><em>当前结果</em><b>${visibleCount}</b></span>
      </div>
      <div class="viz-title">热度分层（压缩视图）</div>
      ${rows}
    </div>
    <div class="viz-card">
      <div class="viz-title">看板强度</div>
      <div class="viz-kpi-grid">
        <div class="viz-kpi"><span>平均热度</span><b>${avgHeat.toFixed(1)}</b></div>
        <div class="viz-kpi"><span>最高热度</span><b>${maxHeat.toFixed(1)}</b></div>
        <div class="viz-kpi"><span>筛选状态</span><b>${STATE.activeVendor || STATE.activeScenario ? "已筛选" : "全部"}</b></div>
      </div>
    </div>
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

  const maxVendor = Math.max(1, ...Object.values(vendorMap));
  const maxScenario = Math.max(1, ...Object.values(scenarioMap));
  const vendorRows = topEntriesFromMap(vendorMap).map(([name, count]) => (
    `<button class="insight-chip ${STATE.activeVendor === name ? "active" : ""}" data-filter-type="vendor" data-filter-value="${name}">
      <span>${name}</span><span class="count">${count}</span>
      <span class="chip-mini"><span class="chip-mini-fill" style="width:${(count / maxVendor) * 100}%"></span></span>
    </button>`
  )).join("");
  const scenarioRows = topEntriesFromMap(scenarioMap).map(([name, count]) => (
    `<button class="insight-chip ${STATE.activeScenario === name ? "active" : ""}" data-filter-type="scenario" data-filter-value="${name}">
      <span>${name}</span><span class="count">${count}</span>
      <span class="chip-mini"><span class="chip-mini-fill" style="width:${(count / maxScenario) * 100}%"></span></span>
    </button>`
  )).join("");

  const vendorClear = `<button class="insight-chip clear ${STATE.activeVendor === "" ? "active" : ""}" data-filter-type="vendor" data-filter-value="">全部厂商</button>`;
  const scenarioClear = `<button class="insight-chip clear ${STATE.activeScenario === "" ? "active" : ""}" data-filter-type="scenario" data-filter-value="">全部场景</button>`;
  document.getElementById("vendorBoard").innerHTML = vendorClear + vendorRows;
  document.getElementById("scenarioBoard").innerHTML = scenarioClear + scenarioRows;
}

function render() {
  const boardData = STATE.current.boards[STATE.board];
  const visibleCurrent = filterAndSort(boardData.skills);
  const currentGrid = document.getElementById("currentGrid");
  currentGrid.innerHTML = visibleCurrent.map((it) => renderCard(it, STATE.board)).join("");

  const dropped = filterAndSort(STATE.history.droppedSkills || []);
  const droppedGrid = document.getElementById("droppedGrid");
  droppedGrid.innerHTML = dropped.map((it) => renderCard(it, STATE.board, true)).join("");
  renderInsights(boardData.skills);
  renderVisualPanel(visibleCurrent);
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
  document.getElementById("vendorBoard").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter-type='vendor']");
    if (!btn) return;
    const value = btn.dataset.filterValue || "";
    STATE.activeVendor = STATE.activeVendor === value ? "" : value;
    render();
  });
  document.getElementById("scenarioBoard").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter-type='scenario']");
    if (!btn) return;
    const value = btn.dataset.filterValue || "";
    STATE.activeScenario = STATE.activeScenario === value ? "" : value;
    render();
  });
}

async function boot() {
  applySavedTheme();
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
  bindThemeToggle();
  bindEvents();
  render();
}

boot().catch((err) => {
  document.getElementById("metaText").textContent = `加载失败: ${err.message}`;
});
