# GitHub Trending 自动博客 — 实施计划

> 状态：已确认参数，进入分步实施
> 最后更新：2026-07-31

---

## 1. 项目概述

构建一个由 **GitHub Pages** 托管的轻量级 Hexo 博客。每天自动从 `github.com/trending` 抓取优质项目，生成一篇「当日热门项目」博文，经 Hexo 构建后推送上线。

**端到端数据流：**

```
本地定时任务(18:00)
   └─ 抓取脚本(Python)  →  github.com/trending/{lang}?since=daily + AI Agent 主题检索
        └─ 生成 Markdown  →  source/_posts/YYYY-MM-DD.md
             └─ hexo generate  →  public/
                  └─ hexo deploy  →  gh-pages 分支  →  GitHub Pages 上线
```

---

## 2. 已确认的核心决策

| 维度 | 决策 | 说明 |
|---|---|---|
| 运行方式 | 本地定时任务 | Windows 任务计划程序每日触发，非 GitHub Actions |
| 内容深度 | 纯数据聚合 | 不调用 LLM，零 API 成本，结果确定 |
| 语言 | 中文为主 | 站点 UI 与博文表头中文；项目名/原描述保留英文原文 |
| 筛选逻辑 | 选项 1+2 | 在指定语言内按「当日 star 增量」降序取 Top N，再合并去重 |
| 目标语言集合 | Python、Go、Rust、TypeScript | 4 种编程语言，通过 trending 语言页抓取 |
| AI Agent 桶 | 额外 1 个「AI Agent 精选」 | 见 §3 关键技术说明（非语言，单独处理） |
| Top N | 每语言取 3，合并后去重 | 4 语言 = 12 篇上限，+AI Agent 3 篇 |
| 运行时间 | 18:00（北京时间） | 任务计划程序每日 18:00 触发 |
| 主题 | 先保留 landscape | 跑通后再评估切换 cactus |

---

## 3. 关键技术说明（含一处设计决策，请复核）

1. **GitHub Trending 无官方 API。** 采用 HTML 解析（`requests` + `BeautifulSoup`），页面直接展示「X stars today」，即「当日 star 增量」来源，可稳定解析。需伪装 User-Agent、加重试与异常告警。

2. **「AI Agent」不是 Trending 语言筛选项，单独处理（⚠️ 重点复核项）。**
   - 编程语言桶（Python/Go/Rust/TypeScript）：走 `trending/{lang}?since=daily`，按「今日新增星标」取 Top 3。
   - AI Agent 桶：GitHub 不提供「按主题的当日趋势」，**改用 GitHub Search API** `q=topic:ai-agent&sort=stars&order=desc&per_page=3`，按**总星标**取 Top 3。
   - 因此博文分两个区块呈现，标签如实区分：
     - **编程语言热门（按今日新增星标）**
     - **AI Agent 精选（按总星标）**
   - 若你更希望 AI Agent 也走「当日趋势」，需引入第三方趋势源（非官方、稳定性差），暂不采用。

3. **合并去重：** 以仓库全名（`owner/repo`）为唯一键去重；最终展示先列编程语言桶（按今日星标降序），再列 AI Agent 桶。

4. **凭据：** 本地自动 push 需免交互凭据，采用 SSH key 或 Fine-grained PAT（写入 Windows 凭据管理器）。

---

## 4. 目录结构与产物

```
hexo-blog/
├─ PLAN.md                      # 本计划文档
├─ _config.yml                  # Hexo 配置（language=zh-CN, deploy=git→gh-pages）
├─ scripts/
│  ├─ trending_blog.py          # 主脚本：抓取 + 解析 + 生成 Markdown
│  ├─ config.yaml               # 可配置项：语言列表、Top N、时间、署名
│  ├─ requirements.txt          # Python 依赖
│  └─ runner.ps1                # 任务计划程序入口：抓取→hexo g→hexo d
├─ source/_posts/
│  └─ YYYY-MM-DD.md             # 自动生成的当日博文（已存在则跳过）
└─ .venv/                       # Python 隔离环境（不入库）
```

---

## 5. 详细执行计划

### Phase 0 — 仓库与基础准备
- **目标：** 建立 git 仓库、配置 Hexo 部署、装好部署器。
- 步骤：
  1. `git init`；建 GitHub 仓库（建议用户页 `panninan.github.io`，或项目页 `<repo>`）。
  2. 配 SSH key / PAT，写入 Windows 凭据管理器，验证免交互 push。
  3. `_config.yml`：`language: zh-CN`、`url: https://panninan.github.io`、`deploy.type: git` → `gh-pages`。
  4. `npm install hexo-deployer-git`。
- 产出：可部署的 Hexo 骨架。
- 验收：`hexo generate` 无报错；`hexo deploy` 能推到 `gh-pages`。
- **需用户配合：** 建 GitHub 仓库、生成并配置凭据。

### Phase 1 — 抓取与生成脚本（Python）
- **目标：** 产出当日博文 Markdown。
- 步骤：
  1. 建 `.venv`，装 `requests`、`beautifulsoup4`、`lxml`、`pyyaml`。
  2. `config.yaml`：语言列表、每语言 Top N=3、AI Agent 开关与 topic、UA、超时、重试。
  3. `trending_blog.py`：
     - `fetch_trending(lang)`：抓 `trending/{lang}?since=daily`，解析 项目名/作者/链接/描述/语言/总星标/今日星标。
     - `fetch_ai_agent()`：Search API `topic:ai-agent` 取 Top 3（总星标）。
     - `dedupe()`：按 `owner/repo` 去重。
     - `render_markdown()`：生成带中文表头的 Markdown，front-matter 含 `title/date/tags/categories`。
     - 幂等：当日文件存在则跳过。
  4. 容错：重试、异常写日志、非零退出码便于任务计划程序告警。
- 产出：`scripts/` 全套 + 一次手动生成的样例博文。
- 验收：手动运行能生成结构正确的 `YYYY-MM-DD.md`。

### Phase 2 — 博文模板与中文布局
- **目标：** 博文排版美观、全中文表头。
- 内容：表格列 = 排名 / 项目 / 描述 / 语言 / 今日星标 / 总星标 / 链接；分区标题「编程语言热门」「AI Agent 精选」；顶部加抓取时间与来源说明。
- 验收：样例博文在本地 `hexo server` 下渲染正常。

### Phase 3 — 构建与部署
- **目标：** 端到端跑通一次上线。
- 步骤：`hexo clean && hexo generate && hexo deploy`；GitHub Pages Source 设为 `gh-pages`。
- 验收：浏览器打开 `https://panninan.github.io` 能看到样例博文。

### Phase 4 — 本地定时任务
- **目标：** 每天 18:00 自动全流程。
- 步骤：
  1. `runner.ps1`：调用 Python 抓取 → `hexo g` → `hexo d`，日志落盘 `scripts/logs/`。
  2. Windows 任务计划程序：每日 18:00 触发，条件「唤醒运行」「失败重试」，绑定 runner.ps1。
  3. 可选失败通知（邮件/钉钉）。
- 验收：次日自动产出新博文并上线（或日志可见执行记录）。

### Phase 5 — 主题与体验优化（可选）
- 保留 landscape 跑通；后续评估切换 cactus（轻量、加载快）。
- 中文化首页/归档/标签；加 RSS、站内搜索、分页。

### Phase 6 — 监控与维护
- 抓取失败、Trending 改版告警；每月回顾语言配置与筛选效果。

---

## 6. 执行顺序与里程碑

**先打通纵向切片（Phase 0 → 3 手动跑通一次真实博文上线），再加 Phase 4 定时与 Phase 5/6。**
- 里程碑 M1：Phase 0 完成（仓库+部署就绪）。
- 里程碑 M2：Phase 1+2 完成（脚本生成样例博文）。
- 里程碑 M3：Phase 3 完成（首次上线）。
- 里程碑 M4：Phase 4 完成（自动化）。

---

## 7. 需用户配合事项

1. 创建 GitHub 仓库（确认用用户页 `panninan.github.io` 还是项目页）。
2. 生成 SSH key 或 Fine-grained PAT，并配置到本机凭据（以便免交互 push）。
3. 复核 §3 第 2 点「AI Agent 用 Search API 按总星标」的处理方式是否可接受。
4. 确认 GitHub Pages 用 `gh-pages` 分支发布。

---

## 8. 风险与回退

- **Trending 反爬/改版：** 加 UA、重试；保留日志；改版时更新解析选择器。
- **Search API 限流：** 每日仅数次请求，未认证 60/h 足够；必要时用 PAT 提额。
- **本地关机漏跑：** 任务计划程序设失败重试；可接受偶尔缺更（非关键业务）。
- **回退：** 任何阶段均可 `git revert`；`gh-pages` 分支独立，不影响源码。

---

## 9. 变更记录

- 2026-07-31：确认参数（语言集合含 AI Agent、Top N=3、18:00、landscape），形成本计划。
