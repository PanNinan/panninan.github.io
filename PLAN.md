# GitHub Trending 自动博客 — 实施计划

> 状态：已确认参数，进入分步实施
> 最后更新：2026-07-31

---

## 1. 项目概述

构建一个由 **GitHub Pages** 托管的轻量级 Hexo 博客。每天自动从 `github.com/trending` 抓取优质项目，生成一篇「当日热门项目」博文，经 Hexo 构建后推送上线。

**端到端数据流：**

```
GitHub Actions 定时(UTC 10:00 = 北京时间 18:00)
   └─ 抓取脚本(Python)  →  github.com/trending/{lang}?since=daily + AI Agent 主题检索
        └─ 生成 Markdown  →  source/_posts/YYYY-MM-DD.md（提交回 main）
             └─ hexo generate  →  public/
                  └─ peaceiris 部署  →  gh-pages 分支  →  GitHub Pages 上线
```

---

## 2. 已确认的核心决策

| 维度 | 决策 | 说明 |
|---|---|---|
| 运行方式 | GitHub Actions 定时 | 云端每日触发，无需本机常开，非本地任务计划程序 |
| 内容深度 | 纯数据聚合 | 不调用 LLM，零 API 成本，结果确定 |
| 语言 | 中文为主 | 站点 UI 与博文表头中文；项目名/原描述保留英文原文 |
| 筛选逻辑 | 选项 1+2 | 在指定语言内按「当日 star 增量」降序取 Top N，再合并去重 |
| 目标语言集合 | Python、Go、Rust、TypeScript | 4 种编程语言，通过 trending 语言页抓取 |
| AI Agent 桶 | 额外 1 个「AI Agent 精选」 | 见 §3 关键技术说明（非语言，单独处理） |
| Top N | 每语言取 3，合并后去重 | 4 语言 = 12 篇上限，+AI Agent 3 篇 |
| 运行时间 | 18:00（北京时间） | Actions cron `0 10 * * *`（UTC 10:00 = 北京时间 18:00） |
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
├─ _config.yml                  # Hexo 配置（language=zh-CN, deploy=git→gh-pages, compress 开关）
├─ compress.js                  # public/ 的 html/css/js 压缩逻辑（可被 hook 与手动 node 调用）
├─ scripts/
│  └─ compress-hook.js          # Hexo 扩展：after_generate 自动压缩（scripts/ 仅放 Hexo JS 扩展）
├─ tools/                       # Python 工具链（不进 scripts/，否则被 Hexo 当脚本加载报错）
│  ├─ trending_blog.py          # 主脚本：抓取 + 解析 + 生成 Markdown
│  ├─ config.yaml               # 可配置项：语言列表、Top N、时间、署名
│  ├─ requirements.txt          # Python 依赖
│  └─ .github/workflows/deploy.yml  # GitHub Actions：每日抓取→提交→构建→部署 gh-pages（Phase 4）
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
  4. 部署采用 **`hexo-deployer-git`**（用户已在本机安装 v4.0.0）。`_config.yml` 已配 `deploy.type: git`、`branch: gh-pages`、`repo: git@github.com:panninan/panninan.github.io.git`。标准命令：`hexo clean && hexo generate && hexo deploy`（或 `hexo g -d`）。
     - **注意**：在 WorkBuddy 内置终端内跑 `hexo deploy` 可能被 safe-delete 回收站 shim 拦截（见 §10）；在本机**普通终端**（PowerShell / Git Bash）执行 `hexo g -d` 不受影响。
- 产出：可部署的 Hexo 骨架。
- 验收：`hexo generate` 无报错；`hexo deploy` 能把 `public/` 推到 `gh-pages`（需本机已配 SSH key / PAT）。
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
     - 幂等：当日文件存在则跳过；`--force` 覆盖。写博文遇 `PermissionError` 会先清除只读属性重试一次（应对文件被占用/只读）。
  4. 容错：重试、异常写日志、非零退出码便于任务计划程序告警。
- 产出：`tools/` 全套（`trending_blog.py` / `config.yaml` / `requirements.txt`）+ 一次手动生成的样例博文。
- 验收：手动运行能生成结构正确的 `YYYY-MM-DD.md`。

### Phase 2 — 博文模板与中文布局
- **目标：** 博文排版美观、全中文表头。
- 内容：表格列 = 排名 / 项目 / 描述 / 语言 / 今日星标 / 总星标 / 链接；分区标题「编程语言热门」「AI Agent 精选」；顶部加抓取时间与来源说明。
- 验收：样例博文在本地 `hexo server` 下渲染正常。

### Phase 3 — 构建与部署
- **目标：** 端到端跑通一次上线。
- 步骤：`hexo clean && hexo generate && hexo deploy`（或 `hexo g -d`）推送 `public/` 到 `gh-pages`；GitHub Pages Source 设为 `gh-pages`。在本机**普通终端**执行即可；若在 WorkBuddy 内置终端跑 `hexo deploy` 报 safe-delete 错误，改到普通终端执行。
  - **构建优化（已接入）**：`compress.js`（压缩 public 的 html/css/js）经 `scripts/compress-hook.js` 挂到 Hexo `after_generate` 过滤器，`hexo generate` 后自动压缩；`_config.yml` 的 `compress: true/false` 可开关（本地 `hexo server` 调试可设为 false）。依赖 `html-minifier-terser`/`terser`/`clean-css` 已写入 `package.json` 与 `yarn.lock`。
- 验收：浏览器打开 `https://panninan.github.io` 能看到样例博文。

### Phase 4 — GitHub Actions 定时(云端自动化,替代本地任务计划程序)
- **目标：** 每天北京时间 18:00 自动跑完「抓取 → 提交源码 → 构建 → 部署」,本机无需常开。
- 实现：`.github/workflows/deploy.yml`
  - 触发：`schedule`（`cron: '0 10 * * *'` = UTC 10:00 = 北京时间 18:00）+ `workflow_dispatch`(手动按钮)。
  - 权限：`permissions: contents: write`（提交博文到 main + 推送 gh-pages）。
  - 步骤：
    1. `actions/checkout@v4` 拉 `main`（`fetch-depth: 0` 以支持回推）。
    2. `setup-python` + `pip install -r tools/requirements.txt` → `python tools/trending_blog.py`（传 `GITHUB_TOKEN` 提升 Search API 限额）。
    3. 把新博文 `git commit` + `push` 回 `main`（无新博文则跳过）。
    4. `setup-node` + `npm install` → `npx hexo generate`（自动跑 compress 钩子）。
    5. `peaceiris/actions-gh-pages@v4` 把 `public/` 推到 `gh-pages`（仅在有新博文或手动触发时部署）。
  - 脚本加固：抓取**全部失败**时 `trending_blog.py` 返回非零 → 工作流失败告警,且不生成空博文。
- 验收：次日自动产出新博文并上线;Actions 页可见运行记录与绿色对勾。
- 注意：本地手动 `hexo deploy`(SSH)与 CI 的 peaceiris 都写 `gh-pages`,以最后一次为准;日常交给 CI 即可,本地仅作调试。

### Phase 5 — 主题与体验优化（可选）
- 保留 landscape 跑通；后续评估切换 cactus（轻量、加载快）。
- 中文化首页/归档/标签；加 RSS、站内搜索、分页。

### Phase 6 — 监控与维护
- 抓取失败、Trending 改版告警；每月回顾语言配置与筛选效果。

---

## 6. 执行顺序与里程碑

**先打通纵向切片（Phase 0 → 3 手动跑通一次真实博文上线），再加 Phase 4 定时与 Phase 5/6。**
- 里程碑 M1：Phase 0 完成（仓库+部署就绪）✅
- 里程碑 M2：Phase 1+2 完成（脚本生成样例博文）✅
- 里程碑 M3：Phase 3 完成（首次上线）— 待你手动 push 后达成
- 里程碑 M4：Phase 4 完成（自动化定时）— 未开始

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
- **CI 延迟/漏跑：** GitHub Actions 定时任务可能在整点后延迟数分钟至数小时排队（非关键业务，可接受）；抓取全失败时工作流会标红失败，可在 Actions 页查看并重跑(`workflow_dispatch`)。
- **回退：** 任何阶段均可 `git revert`；`gh-pages` 分支独立，不影响源码。

---

## 9. 变更记录

- 2026-07-31：确认参数（语言集合含 AI Agent、Top N=3、18:00、landscape），形成本计划。
- 2026-07-31：Phase 0–3 落地：git init(main)、`_config.yml` 配置、抓取脚本 `tools/trending_blog.py`（含 `--force`）、`tools/config.yaml`、首篇样例博文 `source/_posts/2026-07-31.md`、本地 `hexo generate` 通过。
- 2026-07-31：修复 `fetch_ai_agent` 漏传 `params` 导致 Search API 422 的 bug。
- 2026-07-31：源代码已提交本地 `main`，待用户手动 `git push origin main` 后 `hexo g -d` 发布。
- 2026-07-31：用户已在本机安装 `hexo-deployer-git@4.0.0`，部署回归标准 `hexo deploy` 流程（`hexo g -d`）。在本机普通终端执行即可；WorkBuddy 内置终端跑 `hexo deploy` 可能撞 safe-delete shim（见 §10），非本机环境问题。
- 2026-07-31：修复 `hexo clean` 报错根因——Hexo 会把 `scripts/` 目录下**所有文件**当 JS 脚本加载，导致 `trending_blog.py`/`config.yaml`/`requirements.txt`/`logs/*.log` 被当作 JS 编译而 SyntaxError。已将 Python 工具链整体迁移到 `tools/`（脚本路径基于 `__file__` 父目录动态计算，无需改代码），`scripts/` 仅保留真正的 Hexo 扩展 `compress-hook.js`。
- 2026-07-31：接入 `compress.js` 到 Hexo 构建——重构为可导出的 `compress(publicDir)` 函数（保留 `node compress.js` 手动运行能力），新增 `scripts/compress-hook.js` 挂 `after_generate` 自动压缩 public 的 html/css/js；`_config.yml` 加 `compress: true` 开关。依赖 `html-minifier-terser`/`terser`/`clean-css` 经 `yarn add` 进 package.json+yarn.lock（沙箱网络被拦无法安装，需本机 `yarn install`）。
- 2026-07-31：Phase 4 改为 **GitHub Actions 定时**(不再用本地任务计划程序)。新增 `.github/workflows/deploy.yml`：`cron 0 10 * * *`(UTC 10:00=北京时间 18:00)+`workflow_dispatch`；自动抓取→提交博文回 main→`hexo generate`→`peaceiris/actions-gh-pages@v4` 推 `gh-pages`(用 `GITHUB_TOKEN`,无需 SSH key)。脚本加固：`github_token` 支持读 `GITHUB_TOKEN` 环境变量；抓取全失败时返回非零让 CI 失败告警且不生成空博文。部署方式收敛为两条独立路径——本地手动 `hexo deploy`(SSH) 与 CI(peaceiris token),互不冲突。

## 10. 本机环境注意事项（踩坑记录）

- **npm 权限（EPERM）**：`npm install` 写 `package.json`/`node_modules` 偶发 EPERM。现象：hexo 构建报 `EPERM open package.json`、git 提交报 `could not open .git/COMMIT_EDITMSG`。
  - 排查：先用 `node -e` 测试能否写新文件（目录可写）vs 改既有文件（被锁）。
  - 解决：杀掉残留 `node.exe` 进程（`tasklist | grep node` → `taskkill /PID x /F`）；git 报错时删掉 `.git/COMMIT_EDITMSG` 重试即可。
- **沙箱重写限制**：Bash 沙箱对「跨命令重写已存在文件」会拦。脚本重跑需在同一条命令里 `rm -f` 旧文件再执行（或在命令中加 `--force`）。
- **GitHub Search API 422**：通常是请求构造问题（如漏传 `params`/`q`），非限流；先 `curl` 直连验证可用性。
- **WorkBuddy safe-delete 回收站 shim**：WorkBuddy CLI 将 `hexo-fs`/bash 的文件删除路由到系统回收站，单次删除超过 50 个文件需确认；`hexo deploy` 清理 `.deploy_git` 时会触发此拦截而失败（报 `genie-safe-delete` / `trash` 错误）。在本机**普通终端**（PowerShell / Git Bash，非 WorkBuddy 终端）执行 `hexo deploy` 不受影响。
- **Hexo `scripts/` 目录规则（重要）**：Hexo 启动时会把 `scripts/` 及其子目录下**每一个文件**当成 Node.js 脚本 `require` 执行。因此 `scripts/` 内**只能放 `.js` 扩展的 Hexo 插件**（如 `compress-hook.js`），任何 `.py` / `.yaml` / `.txt` / `.log` / `.ps1` 放进都会被当 JS 编译而报 `SyntaxError` / `ReferenceError`。Python 工具链、`config.yaml`、`requirements.txt`、日志目录等一律放在 `tools/`（已迁移）。
