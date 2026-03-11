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

function extractUseCases(detailText) {
  const lines = detailText.split("\n");
  const cases = [];
  let inWhenToUse = false;
  for (const raw of lines) {
    const line = raw.trim();
    const lower = line.toLowerCase();
    if (/^when to use/.test(lower) || /^use this skill when/.test(lower)) {
      inWhenToUse = true;
      continue;
    }
    if (inWhenToUse && (/^what is /.test(lower) || /^how to /.test(lower) || /^## /.test(line) || /^===+$/.test(line) || /^---+$/.test(line))) {
      break;
    }
    if (!inWhenToUse) continue;
    if (/^(\*|-|•)\s+/.test(line)) {
      const cleaned = sanitizeText(line.replace(/^(\*|-|•)\s+/, ""));
      if (cleaned.length >= 8) cases.push(cleaned);
    }
    if (cases.length >= 5) break;
  }
  return cases;
}

function toWords(name) {
  return String(name || "")
    .toLowerCase()
    .split(/[-_:./]+/)
    .filter(Boolean);
}

function toChineseTitle(name) {
  const map = {
    simple: "简化执行技能",
    brainstorming: "头脑风暴技能",
    find: "发现",
    skills: "技能",
    skill: "技能",
    creator: "创建器",
    react: "React",
    next: "Next.js",
    web: "网页",
    design: "设计",
    guidelines: "指南",
    best: "最佳",
    practices: "实践",
    frontend: "前端",
    backend: "后端",
    browser: "浏览器",
    use: "使用",
    azure: "Azure",
    ai: "AI",
    cloud: "云",
    migrate: "迁移",
    compute: "算力",
    postgres: "Postgres",
    copywriting: "文案写作",
    seo: "SEO",
    debugging: "调试",
    review: "评审",
    testing: "测试",
    auth: "认证",
    image: "图片",
    video: "视频",
    markdown: "Markdown",
    docx: "Word",
    pptx: "PPT",
    xlsx: "Excel",
    shadcn: "Shadcn",
    git: "Git",
    workflow: "流程",
    api: "API",
    mcp: "MCP",
    canvas: "画布",
    launch: "发布",
    strategy: "策略",
    marketing: "营销",
    content: "内容"
  };
  const words = toWords(name);
  const converted = words.map((w) => map[w]).filter(Boolean);
  if (converted.length >= 2) return converted.join("");
  if (converted.length === 1) return converted[0].endsWith("技能") ? converted[0] : `${converted[0]}技能`;
  return "通用效率技能";
}

function inferTaskFromSkillId(name) {
  const text = String(name || "").toLowerCase();
  if (/brainstorm|idea/.test(text)) return "快速产出思路和备选方案";
  if (/simple|simplify/.test(text)) return "把复杂任务拆成更易执行的步骤";
  if (/debug|fix|error/.test(text)) return "定位问题根因并给出修复路径";
  if (/review/.test(text)) return "审查方案质量并指出风险点";
  if (/deploy|cicd|release/.test(text)) return "完成上线发布和自动化流程";
  if (/seo/.test(text)) return "提升搜索流量和内容可见性";
  if (/design|ui|ux/.test(text)) return "优化页面体验和视觉一致性";
  if (/react|next|frontend|vue/.test(text)) return "提升前端代码质量和开发效率";
  if (/auth/.test(text)) return "设计并落地认证授权流程";
  return "提升日常工作的执行效率";
}

function summarizeUseInChinese(name, uses) {
  const text = `${name} ${uses}`.toLowerCase();
  if (/find|discover|install/.test(text)) return "帮你快速找到并安装合适的技能，避免在海量仓库里盲目搜索。";
  if (/design|ui|ux|figma|brand|banner/.test(text)) return "帮你把设计需求快速落地为可执行方案，减少反复改稿和风格不统一。";
  if (/react|next|frontend|vue|typescript|tailwind|code/.test(text)) return "帮你写出更规范的前端代码，减少重构返工和低级错误。";
  if (/seo|marketing|copywriting|content|cro|launch/.test(text)) return "帮你优化增长和内容策略，解决选题难、转化低、活动复盘慢的问题。";
  if (/azure|cloud|database|postgres|api|deploy|cicd|infra/.test(text)) return "帮你处理云和后端配置，降低部署复杂度，减少环境和权限问题。";
  if (/test|debug|review|verification|benchmark/.test(text)) return "帮你系统地测试和排错，定位问题更快，交付更稳。";
  if (/image|video|comic|slide|pptx|docx|xlsx|markdown/.test(text)) return "帮你批量生成内容素材和文档，适合内容团队快速出稿。";
  return "帮你把重复工作标准化，降低学习门槛，让新手也能快速上手。";
}

function buildChineseIntro(name, uses, audience, scenarios, useCases = []) {
  const people = (audience && audience.length ? audience : ["AI 工作者"]).join("、");
  const scene = (scenarios && scenarios.length ? scenarios : ["通用效率提升"]).join("、");
  const short = summarizeUseInChinese(name, uses);
  const noOfficialDesc = uses.includes("暂无官方描述");
  const fallbackTask = inferTaskFromSkillId(name);
  const mappedCases = useCases
    .slice(0, 2)
    .map((x) => x.replace(/^asks?/i, "当你").replace(/^wants?/i, "当你想").replace(/^mentions?/i, "当你提到"))
    .join("；");
  const caseSentence = mappedCases
    ? `常见触发场景包括：${mappedCases}。`
    : noOfficialDesc
      ? `当你需要${fallbackTask}时，它会给出可直接执行的步骤。`
      : "常见触发场景是“我知道想做什么，但不知道从哪一步开始”。";
  return `这是一个面向${people}的实用技能，主要用于${scene}。${short}${caseSentence}`;
}

function ensureIntroDiversity(items) {
  const seen = new Map();
  for (const item of items) {
    const key = item.introZh;
    const count = seen.get(key) || 0;
    if (count > 0) {
      const scenario = (item.scenarios && item.scenarios[0]) || "通用效率提升";
      const audience = (item.audience && item.audience[0]) || "AI 工作者";
      const task = inferTaskFromSkillId(item.name);
      item.introZh = `${item.introZh} 这个技能更偏向「${scenario}」场景，重点解决“${task}”问题，适合${audience}快速上手。`;
    }
    seen.set(key, count + 1);
  }
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
    entry.heat.allTimeScore = Number(allN[idx].toFixed(1));
    entry.heat.trendingScore = Number(trN[idx].toFixed(1));
    entry.heat.hotScore = Number(hotN[idx].toFixed(1));
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
          nameEn: item.name,
          nameZh: toChineseTitle(item.name),
          vendor: inferVendor(item.owner),
          detailUrl: item.detailUrl,
          uses: "",
          introZh: "",
          useCases: [],
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
    const detailText = detailTexts[idx] || "";
    const uses = extractUses(detailText, item.name);
    const useCases = extractUseCases(detailText);
    const { audience, scenarios } = inferAudienceAndScenarios(item.name, uses);
    item.uses = uses;
    item.useCases = useCases;
    item.introZh = buildChineseIntro(item.name, uses, audience, scenarios, useCases);
    item.audience = audience;
    item.scenarios = scenarios;
  });
  ensureIntroDiversity(uniqueSkills);

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
