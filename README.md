# Skills 榜单跟踪器 + 解读器

面向 `skills.sh` 的三榜单追踪系统，支持：
- `All Time` 前100
- `Trending (24h)` 前100
- `Hot` 前100

并且保留“历史入榜但已掉出前100”的技能到掉榜区。

## 你能看到什么
- 每个 skill 一张卡片：名称、用途、发布厂商、适合人群、适合场景、总热度
- 三榜单切换
- 搜索 + 排序
- 掉榜区折叠展示

## 热度口径
- `totalHeat = 0.6*allTime + 0.25*trending + 0.15*hotDelta`（均先做归一化）
- 卡片同时显示原始指标：
  - All Time 安装量
  - Trending 安装量
  - Hot 的 1h 增量

## 本地查看（傻瓜式）
- 直接双击打开 `index.html` 即可。
- 如果要刷新数据，运行：
  - `node scripts/fetch-and-build.js`

## 线上自动更新（GitHub Pages）
1. 推送代码到 GitHub 仓库。
2. 在仓库设置中开启 **Pages**（Source 选 GitHub Actions）。
3. 手动触发一次工作流：`Update Skills Tracker`。
4. 后续每天自动更新一次（UTC 01:10）。

工作流文件：`/.github/workflows/update-skills-tracker.yml`
