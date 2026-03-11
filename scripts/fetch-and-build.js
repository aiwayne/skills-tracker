#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const CURRENT_FILE = path.join(DATA_DIR, "skills-current.json");
const HISTORY_FILE = path.join(DATA_DIR, "skills-history.json");
const CURRENT_JS_FILE = path.join(DATA_DIR, "skills-current.js");
const HISTORY_JS_FILE = path.join(DATA_DIR, "skills-history.js");

const BOARD_CONFIG = {
  allTime: { api: "all-time", label: "All Time" },
  trending: { api: "trending", label: "Trending (24h)" },
  hot: { api: "hot", label: "Hot" }
};

function toMdProxy(url) {
  const normalized = url.replace(/^https:\/\//, "http://");
  return `https://r.jina.ai/${normalized}`;
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function parseAbbrNumber(raw) {
  if (!raw) return 0;
  const text = String(raw).trim().toUpperCase();
  const m = text.match(/^(\d+(?:\.\d+)?)([KM]?)$/);
  if (!m) return Number(text) || 0;
  const n = Number(m[1]);
  if (m[2] === "K") return n * 1000;
  if (m[2] === "M") return n * 1000000;
  return n;
}

function normalize(values) {
  const max = Math.max(1, ...values);
  return values.map((v) => (v / max) * 100);
}

function formatAbbrNumber(value) {
  if (!Number.isFinite(value)) return "-";
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}

function sanitizeText(str) {
  return String(str || "")
    .replace(/`+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractUses(detailText, fallbackName) {
  const lines = detailText.split("\n").map((line) => line.trim()).filter(Boolean);
  const idx = lines.findIndex((line) => line.toUpperCase() === "SKILL.MD");
  const start = idx >= 0 ? idx + 1 : 0;
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith("#")) continue;
    if (line.startsWith("```")) continue;
    if (line.startsWith("[")) continue;
    const text = sanitizeText(line);
    if (text.length >= 20) return text.slice(0, 180);
  }
  return `${fallbackName}：暂无官方描述，建议点开详情页查看。`;
}

function inferAudienceAndScenarios(name, uses) {
  const text = `${name} ${uses}`.toLowerCase();
  const audience = new Set();
  const scenarios = new Set();

  if (/design|ui|ux|figma|screenshot|brand|banner/.test(text)) {
    audience.add("设计师");
    scenarios.add("界面设计");
  }
  if (/react|next|frontend|vue|tailwind|typescript|coding|code/.test(text)) {
    audience.add("前端工程师");
    scenarios.add("代码开发");
  }
  if (/seo|marketing|copywriting|launch|content|growth|cro/.test(text)) {
    audience.add("增长运营");
    scenarios.add("增长实验");
  }
  if (/azure|postgres|database|api|deploy|cicd|cloud/.test(text)) {
    audience.add("后端/平台工程师");
    scenarios.add("云与基础设施");
  }
  if (/test|debug|review|benchmark|verification/.test(text)) {
    audience.add("研发团队");
    scenarios.add("质量保障");
  }
  if (/video|image|comic|slide|pptx|docx|xlsx/.test(text)) {
    audience.add("内容团队");
    scenarios.add("内容生产");
  }

  if (audience.size === 0) audience.add("AI 工作者");
  if (scenarios.size === 0) scenarios.add("通用效率提升");
  return { audience: Array.from(audience), scenarios: Array.from(scenarios) };
}

function inferVendor(owner) {
  const map = {
    "vercel-labs": "Vercel Labs",
    anthropics: "Anthropic",
    microsoft: "Microsoft",
    github: "GitHub",
    expo: "Expo",
    "supercent-io": "Supercent",
    "inference-shell": "Inference Shell",
    "coreyhaines31": "CoreyHaines31",
    "jimliu": "Jim Liu"
  };
  return map[owner] || owner;
}

async function fetchText(url, retry = 3) {
  let lastErr;
  for (let i = 0; i < retry; i += 1) {
    try {
      const resp = await fetch(toMdProxy(url), { headers: { "User-Agent": "skills-tracker-bot/1.0" } });
      if (!resp.ok) throw new Error(`${url} -> ${resp.status}`);
      return await resp.text();
    } catch (err) {
      lastErr = err;
      await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)));
    }
  }
  throw lastErr;
}

async function fetchBoardTop100(boardKey, apiKey) {
  const resp = await fetch(`https://skills.sh/api/skills/${apiKey}/0`, {
    headers: { "User-Agent": "skills-tracker-bot/1.0" }
  });
  if (!resp.ok) throw new Error(`api/skills/${apiKey}/0 -> ${resp.status}`);
  const json = await resp.json();
  const list = Array.isArray(json.skills) ? json.skills.slice(0, 100) : [];
  return list.map((row, idx) => {
    const source = String(row.source || "");
    const slash = source.indexOf("/");
    const owner = slash > 0 ? source.slice(0, slash) : source;
    const repo = slash > 0 ? source.slice(slash + 1) : "unknown";
    const skill = row.skillId;
    const installs = Number(row.installs || 0);
    const change = Number(row.change || 0);
    return {
      key: `${owner}/${repo}/${skill}`,
      owner,
      repo,
      skill,
      name: row.name || skill,
      rank: idx + 1,
      detailUrl: `https://skills.sh/${owner}/${repo}/${skill}`,
      board: boardKey,
      heatRaw: formatAbbrNumber(installs),
      heatValue: installs,
      deltaRaw: change ? formatAbbrNumber(change) : null,
      deltaValue: change
    };
  });
}

async function fetchWithConcurrency(items, worker, limit = 8) {
  const results = [];
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      results[idx] = await worker(items[idx], idx);
    }
  }
  const tasks = Array.from({ length: Math.min(limit, items.length) }, run);
  await Promise.all(tasks);
  return results;
}

function safeReadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function composeCurrent(boards, skillsMap, generatedAt) {
  const payload = { generatedAt, boards: {} };
  for (const boardKey of Object.keys(BOARD_CONFIG)) {
    const cfg = BOARD_CONFIG[boardKey];
    const ranked = boards[boardKey]
      .slice()
      .sort((a, b) => a.rank - b.rank)
      .map((entry) => skillsMap[entry.key])
      .filter(Boolean);
    payload.boards[boardKey] = { label: cfg.label, skills: ranked };
  }
  return payload;
}

function buildHeat(skillsMap) {
  const entries = Object.values(skillsMap);
  const allVals = entries.map((x) => x.heat.allTimeValue || 0);
  const trVals = entries.map((x) => x.heat.trendingValue || 0);
  const hotVals = entries.map((x) => x.heat.hotDeltaValue || 0);
  const allN = normalize(allVals);
  const trN = normalize(trVals);
  const hotN = normalize(hotVals);
  entries.forEach((entry, idx) => {
    entry.heat.totalHeat = Number((0.6 * allN[idx] + 0.25 * trN[idx] + 0.15 * hotN[idx]).toFixed(1));
  });
}

function mergeHistory(previousHistory, skillsMap, boardRows, generatedAt) {
  const prevRegistry = previousHistory.registry || {};
  const registry = { ...prevRegistry };
  const currentKeys = new Set(Object.keys(skillsMap));

  for (const key of currentKeys) {
    const cur = skillsMap[key];
    const prev = registry[key] || {};
    const snapshot = {
      at: generatedAt,
      ranks: cur.ranks,
      heat: cur.heat.totalHeat
    };
    const oldSnaps = Array.isArray(prev.snapshots) ? prev.snapshots : [];
    registry[key] = {
      ...cur,
      firstSeenAt: prev.firstSeenAt || generatedAt,
      lastSeenAt: generatedAt,
      status: "current",
      everTop100Boards: Array.from(new Set([...(prev.everTop100Boards || []), ...Object.keys(cur.ranks).filter((b) => cur.ranks[b])])),
      snapshots: [...oldSnaps.slice(-29), snapshot]
    };
  }

  for (const key of Object.keys(registry)) {
    if (!currentKeys.has(key)) {
      registry[key] = {
        ...registry[key],
        status: "dropped",
        droppedAt: generatedAt
      };
    }
  }

  const droppedSkills = Object.values(registry)
    .filter((x) => x.status === "dropped")
    .sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));

  return {
    generatedAt,
    registry,
    droppedSkills,
    boardCounts: Object.fromEntries(Object.keys(BOARD_CONFIG).map((bk) => [bk, boardRows[bk].length]))
  };
}

async function run() {
  ensureDir();
  console.log("开始抓取榜单...");

  const boardRows = {};
  for (const [board, cfg] of Object.entries(BOARD_CONFIG)) {
    boardRows[board] = await fetchBoardTop100(board, cfg.api);
    console.log(`${cfg.label}: ${boardRows[board].length} 条`);
  }

  const mergedMap = {};
  for (const board of Object.keys(BOARD_CONFIG)) {
    for (const item of boardRows[board]) {
      if (!mergedMap[item.key]) {
        mergedMap[item.key] = {
          key: item.key,
          owner: item.owner,
          repo: item.repo,
          skill: item.skill,
          name: item.name,
          vendor: inferVendor(item.owner),
          detailUrl: item.detailUrl,
          uses: "",
          audience: [],
          scenarios: [],
          ranks: { allTime: null, trending: null, hot: null },
          heat: {
            allTimeRaw: "-",
            allTimeValue: 0,
            trendingRaw: "-",
            trendingValue: 0,
            hotRaw: "-",
            hotDeltaValue: 0,
            totalHeat: 0
          }
        };
      }
      const row = mergedMap[item.key];
      row.ranks[board] = item.rank;
      if (board === "allTime") {
        row.heat.allTimeRaw = item.heatRaw;
        row.heat.allTimeValue = item.heatValue;
      } else if (board === "trending") {
        row.heat.trendingRaw = item.heatRaw;
        row.heat.trendingValue = item.heatValue;
      } else if (board === "hot") {
        row.heat.hotRaw = item.deltaRaw ? `${item.heatRaw}+${item.deltaRaw}` : item.heatRaw;
        row.heat.hotDeltaValue = item.deltaValue || item.heatValue;
      }
    }
  }

  const uniqueSkills = Object.values(mergedMap);
  console.log(`拉取详情页: ${uniqueSkills.length} 个`);
  const detailTexts = await fetchWithConcurrency(uniqueSkills, async (item) => {
    try {
      return await fetchText(item.detailUrl);
    } catch {
      return "";
    }
  }, 3);

  uniqueSkills.forEach((item, idx) => {
    const uses = extractUses(detailTexts[idx], item.name);
    const { audience, scenarios } = inferAudienceAndScenarios(item.name, uses);
    item.uses = uses;
    item.audience = audience;
    item.scenarios = scenarios;
  });

  buildHeat(mergedMap);
  const generatedAt = Date.now();
  const previousHistory = safeReadJson(HISTORY_FILE, { registry: {} });
  const current = composeCurrent(boardRows, mergedMap, generatedAt);
  const history = mergeHistory(previousHistory, mergedMap, boardRows, generatedAt);

  fs.writeFileSync(CURRENT_FILE, JSON.stringify(current, null, 2), "utf-8");
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), "utf-8");
  fs.writeFileSync(CURRENT_JS_FILE, `window.__SKILLS_CURRENT__ = ${JSON.stringify(current, null, 2)};\n`, "utf-8");
  fs.writeFileSync(HISTORY_JS_FILE, `window.__SKILLS_HISTORY__ = ${JSON.stringify(history, null, 2)};\n`, "utf-8");
  console.log("构建完成:", CURRENT_FILE, HISTORY_FILE);
}

run().catch((err) => {
  console.error("构建失败:", err);
  process.exit(1);
});
