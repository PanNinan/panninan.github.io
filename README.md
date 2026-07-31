# GitHub Trending 自动博客

> 一个由 **Hexo + GitHub Pages** 托管的轻量级博客。每天北京时间 18:00 自动抓取 GitHub Trending 热门项目，生成一篇「当日热门项目」博文并上线。

零 LLM 调用、零内容生成成本、结果确定可复现——只做数据聚合与排版。

---

## 功能特性

- **每日自动更新**：GitHub Actions 定时任务（`cron: 0 10 * * *`，即 UTC 10:00 = 北京时间 18:00）触发，本机无需常开。
- **多语言桶**：在 `Python / Go / Rust / TypeScript` 的 Trending 语言页，按「今日新增星标」各取 Top 3。
- **AI Agent 精选桶**：通过 GitHub Search API 按 `topic:ai-agents` 取「总星标」Top 3，与语言桶合并去重（`owner/repo` 唯一键）。
- **中文呈现**：站点 UI 与博文表头全中文；项目名、描述保留英文原文。
- **构建压缩**：`hexo generate` 后自动压缩 `public/` 下的 `html / css / js`，减小体积、加快加载。
- **一键部署**：支持 `hexo deploy`（本地 SSH）与 GitHub Actions 自动部署（`gh-pages` 分支）两条独立路径。

---

## 架构与数据流

```
GitHub Actions 定时 (UTC 10:00 = 北京时间 18:00)
   └─ 抓取脚本 (Python)  →  github.com/trending/{lang}?since=daily  +  AI Agent 主题检索
        └─ 生成 Markdown  →  source/_posts/YYYY-MM-DD.md（提交回 main）
             └─ hexo generate  →  public/
                  └─ 压缩 + peaceiris 部署  →  gh-pages 分支  →  GitHub Pages 上线
```

---

## 目录结构

```
hexo-blog/
├─ README.md                    # 本文件
├─ PLAN.md                      # 详细实施计划与踩坑记录
├─ _config.yml                  # Hexo 配置（language=zh-CN、deploy=git→gh-pages、compress 开关）
├─ compress.js                  # public/ 的 html/css/js 压缩逻辑（可被 hook 与手动 node 调用）
├─ package.json                 # Node 依赖与脚本（build/clean/deploy/server）
├─ scripts/
│  └─ compress-hook.js          # Hexo 扩展：after_generate 自动压缩（scripts/ 仅放 Hexo JS 扩展）
├─ tools/                       # Python 工具链（不放 scripts/，否则被 Hexo 当脚本加载报错）
│  ├─ trending_blog.py          # 主脚本：抓取 + 解析 + 生成 Markdown
│  ├─ config.yaml               # 可配置项：语言列表、Top N、时间窗口、署名
│  └─ requirements.txt          # Python 依赖
├─ .github/workflows/
│  └─ deploy.yml                # GitHub Actions：每日抓取→提交→构建→部署 gh-pages
├─ source/_posts/
│  └─ YYYY-MM-DD.md             # 自动生成的当日博文（已存在则跳过）
├─ node_modules/                # 不入库
└─ public/                      # 构建产物，不入库
```

---

## 环境要求

| 工具 | 版本 | 用途 |
|---|---|---|
| Node.js | ≥ 22 | Hexo 构建、压缩 |
| Python | ≥ 3.12 | 抓取脚本 |
| Git | 任意新版 | 版本管理、部署 |

---

## 安装与本地运行

### 1. 安装依赖

```bash
# Node 依赖（含 hexo、hexo-deployer-git、压缩相关库）
npm install
# 若用 yarn：
yarn install

# Python 依赖（建议虚拟环境）
python -m venv .venv
source .venv/Scripts/activate        # Windows
pip install -r tools/requirements.txt
```

### 2. 手动生成一篇博文

```bash
python tools/trending_blog.py          # 当日博文不存在时生成；已存在则跳过
python tools/trending_blog.py --force  # 覆盖已存在的当日博文
```

### 3. 本地预览

```bash
npx hexo server       # 默认 http://localhost:4000
```

### 4. 构建（含压缩）

```bash
npx hexo generate     # 等价于 npm run build，生成后自动压缩 public/
```

---

## 配置说明（`tools/config.yaml`）

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `languages` | `Python, Go, Rust, TypeScript` | 编程语言桶，按 Trending 语言页抓取 |
| `top_n` | `3` | 每个语言桶取前 N（按今日新增星标降序） |
| `since` | `daily` | 时间窗口：`daily` / `weekly` / `monthly` |
| `ai_agent_topic` | `ai-agents` | AI Agent 桶检索主题 |
| `ai_agent_top_n` | `3` | AI Agent 桶取前 N（按总星标） |
| `timeout` | `20` | 单次请求超时（秒） |
| `max_retries` | `3` | 请求失败重试次数 |
| `retry_backoff` | `3` | 重试间隔（秒） |
| `github_token` | 空 | 可选；填入可把 Search API 限额从 60/h 提升到 5000/h |
| `overwrite` | `false` | 当日博文已存在时是否覆盖 |

> 修改后下次运行生效。CI 环境会自动读取 `GITHUB_TOKEN` 环境变量（无需手动填 `github_token`）。

---

## 自动化部署（GitHub Actions）

工作流文件：`.github/workflows/deploy.yml`

- **触发**：每日 UTC 10:00 定时 + 仓库 Actions 页「Run workflow」手动按钮。
- **权限**：`permissions: contents: write`（提交博文 + 推送 gh-pages）。
- **流程**：检出 `main` → 装 Python 依赖 → 跑抓取脚本（传入 `GITHUB_TOKEN`）→ 有新博文则 `commit` 回 `main` → 装 Node 依赖 → `hexo generate` → `peaceiris/actions-gh-pages@v4` 推 `gh-pages`。
- **容错**：抓取全部失败时脚本返回非零，工作流标红失败且不生成空博文；可在 Actions 页查看并重跑。

### 启用步骤

1. 推送代码到 GitHub 仓库（`main` 分支）。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 `Deploy from a branch`，分支选 `gh-pages`、目录选 `/ (root)`。
3. 访问 `https://<你的用户名>.github.io/` 查看结果。
4. 次日 Actions 页应出现绿色对勾运行记录；亦可手动「Run workflow」立即验证。

---

## 手动部署（本地）

```bash
npx hexo clean && npx hexo generate && npx hexo deploy   # 或 npx hexo g -d
```

需在 `~/.ssh` 配置好指向 GitHub 的 SSH key，或把仓库 `deploy.repo` 改为 HTTPS + Personal Access Token。

> CI 的 `peaceiris` 部署与本地 `hexo deploy` 都写入 `gh-pages`，以最后一次为准。日常交给 CI 即可，本地仅作调试。

---

## 构建压缩

`compress.js` 在 `hexo generate` 之后自动压缩 `public/` 下的 `html / css / js`（原地覆盖），由 `scripts/compress-hook.js` 挂载到 Hexo `after_generate` 钩子。

- 开关：编辑 `_config.yml` 的 `compress: true | false`。本地调试想保留可读性可临时设为 `false`。
- 单独手动运行：`node compress.js`（压缩当前 `./public`）。
- 依赖：`html-minifier-terser`、`terser`、`clean-css`（已写入 `package.json`）。

---

## 注意事项与踩坑

- **`scripts/` 目录规则**：Hexo 会把 `scripts/` 下**每一个文件**当 Node.js 脚本 `require` 执行。因此该目录**只能放 `.js` 扩展的 Hexo 插件**（如 `compress-hook.js`）。Python 工具链、`config.yaml`、`requirements.txt`、日志等一律放在 `tools/`。
- **Trending 无官方 API**：采用 HTML 解析（`requests` + `BeautifulSoup`），页面改版时需同步更新 `tools/trending_blog.py` 中的选择器。
- **AI Agent 桶口径不同**：Trending 不支持「按主题的趋势」，故 AI Agent 桶用 GitHub Search API 按**总星标**排序，博文中已明确分区标注，与「今日新增星标」口径区分。
- **CI 定时可能延迟**：GitHub Actions 定时任务可能在整点后排队数分钟至数小时（非关键业务，可接受）。
- **部署冲突**：本地 `hexo deploy` 清理 `.deploy_git` 时，若所在终端把删除路由到系统回收站（如某些集成终端），可能触发拦截而失败；请在本机普通终端（PowerShell / Git Bash）执行。

---

## 许可证

本项目为个人自动化博客，代码以 MIT 许可证开源（如需启用，请补充 LICENSE 文件）。
