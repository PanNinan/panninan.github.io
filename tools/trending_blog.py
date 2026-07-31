#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GitHub Trending 自动博客 — 抓取与博文生成

流程：
  1. 抓取 GitHub Trending 各语言页（since=daily），按「今日新增星标」各取 Top N
  2. 抓取 GitHub Search（topic=ai-agents）按总星标取 Top N
  3. 按 owner/repo 去重，合并
  4. 渲染为中文 Markdown 博文，写入 source/_posts/YYYY-MM-DD.md

设计要点（见 PLAN.md §3）：
  - Trending 无官方 API，使用 HTML 解析；Search 用官方 REST API。
  - AI Agent 桶无「当日趋势」，按总星标呈现，博文分区如实标注。
  - 幂等：当日文件已存在且 overwrite=False 则跳过。
"""

import argparse
import logging
import os
import pathlib
import stat
import re
import sys
import time
from datetime import date, datetime

import requests
import yaml
from bs4 import BeautifulSoup

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
CONFIG_PATH = pathlib.Path(__file__).resolve().parent / "config.yaml"
POSTS_DIR = REPO_ROOT / "source" / "_posts"
LOG_DIR = pathlib.Path(__file__).resolve().parent / "logs"

logger = logging.getLogger("trending_blog")


def setup_logging():
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    handlers = [logging.StreamHandler(sys.stdout)]
    try:
        handlers.append(logging.FileHandler(LOG_DIR / "trending.log", encoding="utf-8"))
    except OSError as e:
        # 日志目录不可写时不阻断主流程，仅输出到控制台
        print(f"[warn] 无法写入日志文件，仅输出到控制台：{e}", file=sys.stderr)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=handlers,
    )


def load_config():
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def http_get(url, headers, timeout, max_retries, backoff, params=None):
    last_err = None
    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.get(url, headers=headers, params=params, timeout=timeout)
            resp.raise_for_status()
            return resp
        except requests.RequestException as e:
            last_err = e
            logger.warning("请求失败 (%s/%s) %s: %s", attempt, max_retries, url, e)
            if attempt < max_retries:
                time.sleep(backoff)
    raise last_err


def fetch_trending(lang, cfg):
    """抓取单个语言的 Trending 页，返回仓库字典列表。"""
    slug = lang.strip().lower()
    url = f"https://github.com/trending/{slug}?since={cfg.get('since', 'daily')}"
    headers = {"User-Agent": cfg["user_agent"], "Accept-Language": "en-US,en;q=0.9"}
    resp = http_get(url, headers, cfg["timeout"], cfg["max_retries"], cfg["retry_backoff"])
    return _parse_trending(resp.text, lang)


def _parse_trending(html, lang_label):
    soup = BeautifulSoup(html, "lxml")
    repos = []
    for article in soup.select("article.Box-row"):
        # 仓库路径：h2 下的 a href="/owner/repo"
        a = article.select_one("h2 a")
        if not a or not a.get("href"):
            continue
        repo_path = a["href"].strip("/")
        if repo_path.count("/") != 1:
            continue

        desc_el = article.select_one("p")
        description = desc_el.get_text(strip=True) if desc_el else ""

        lang_el = article.select_one('span[itemprop="programmingLanguage"]')
        language = lang_el.get_text(strip=True) if lang_el else lang_label

        # 总星标：stargazers 链接文本
        stars_total = None
        star_link = article.select_one('a[href$="/stargazers"]')
        if star_link:
            m = re.search(r"[\d,]+", star_link.get_text(strip=True))
            if m:
                stars_total = int(m.group(0).replace(",", ""))

        # 今日新增星标：页面文本 "X stars today"
        stars_today = None
        text = article.get_text(" ", strip=True)
        m = re.search(r"([\d,]+)\s+stars\s+today", text, re.IGNORECASE)
        if m:
            stars_today = int(m.group(1).replace(",", ""))

        repos.append(
            {
                "repo_path": repo_path,
                "url": f"https://github.com/{repo_path}",
                "description": description,
                "language": language,
                "stars_total": stars_total,
                "stars_today": stars_today,
                "metric": "today",
            }
        )
    return repos


def fetch_ai_agent(cfg):
    """通过 GitHub Search API 按 topic 取总星标 Top N。"""
    url = "https://api.github.com/search/repositories"
    params = {
        "q": f"topic:{cfg['ai_agent_topic']}",
        "sort": "stars",
        "order": "desc",
        "per_page": cfg.get("ai_agent_top_n", cfg.get("top_n", 3)),
    }
    headers = {
        "User-Agent": cfg["user_agent"],
        "Accept": "application/vnd.github+json",
    }
    token = cfg.get("github_token") or os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    resp = http_get(
        url, headers, cfg["timeout"], cfg["max_retries"], cfg["retry_backoff"], params=params
    )
    data = resp.json()
    repos = []
    for item in data.get("items", []):
        repos.append(
            {
                "repo_path": item["full_name"],
                "url": item["html_url"],
                "description": item.get("description") or "",
                "language": item.get("language") or "",
                "stars_total": item.get("stargazers_count"),
                "stars_today": None,
                "metric": "total",
            }
        )
    return repos


def dedupe_and_merge(lang_repos, ai_repos):
    seen = set()
    merged = []
    for r in lang_repos + ai_repos:
        if r["repo_path"] in seen:
            continue
        seen.add(r["repo_path"])
        merged.append(r)
    return merged


def _esc(text):
    """转义 Markdown 表格中的特殊字符。"""
    return text.replace("|", "\\|").replace("\n", " ").replace("\r", " ").strip()


def _fmt_stars(n):
    return f"{n:,}" if isinstance(n, int) else "-"


def render_markdown(today, lang_repos, ai_repos):
    today_disp = today
    lines = []
    lines.append("---")
    lines.append(f"title: GitHub 每日热门项目（{today_disp}）")
    lines.append(f"date: {today_disp} 18:00:00")
    lines.append("tags:")
    lines.append("  - github-trending")
    lines.append("  - 每日热门")
    lines.append("  - 自动化")
    lines.append("categories:")
    lines.append("  - 自动博客")
    lines.append("---")
    lines.append("")
    lines.append(f"# GitHub 每日热门项目（{today_disp}）")
    lines.append("")
    lines.append(
        "> 数据来源：[GitHub Trending](https://github.com/trending) 与 GitHub Search API，"
        f"抓取时间 {today_disp} 18:00（北京时间）。编程语言按「今日新增星标」排序，"
        "AI Agent 按「总星标」排序。"
    )
    lines.append("")

    lines.append("## 编程语言热门（按今日新增星标）")
    lines.append("")
    lines.append("| # | 项目 | 描述 | 语言 | 今日星标 | 总星标 |")
    lines.append("|---|------|------|------|---------|--------|")
    if lang_repos:
        for i, r in enumerate(lang_repos, 1):
            lines.append(
                f"| {i} | [{_esc(r['repo_path'])}]({r['url']}) | {_esc(r['description'])} "
                f"| {_esc(r['language'])} | {_fmt_stars(r['stars_today'])} "
                f"| {_fmt_stars(r['stars_total'])} |"
            )
    else:
        lines.append("| - | 暂无数据 | - | - | - | - |")
    lines.append("")

    lines.append("## AI Agent 精选（按总星标）")
    lines.append("")
    lines.append("| # | 项目 | 描述 | 语言 | 总星标 |")
    lines.append("|---|------|------|------|--------|")
    if ai_repos:
        for i, r in enumerate(ai_repos, 1):
            lines.append(
                f"| {i} | [{_esc(r['repo_path'])}]({r['url']}) | {_esc(r['description'])} "
                f"| {_esc(r['language'])} | {_fmt_stars(r['stars_total'])} |"
            )
    else:
        lines.append("| - | 暂无数据 | - | - | - |")
    lines.append("")

    return "\n".join(lines)


def main():
    setup_logging()
    parser = argparse.ArgumentParser(description="GitHub Trending 自动博客生成器")
    parser.add_argument("--force", action="store_true", help="覆盖已存在的当日博文")
    args, _ = parser.parse_known_args()

    cfg = load_config()
    if args.force:
        cfg["overwrite"] = True
    today = date.today().isoformat()

    POSTS_DIR.mkdir(parents=True, exist_ok=True)
    post_path = POSTS_DIR / f"{today}.md"
    if post_path.exists() and not cfg.get("overwrite", False):
        logger.info("今日博文已存在，跳过：%s", post_path)
        return 0

    # 1) 编程语言桶
    lang_all = []
    for lang in cfg.get("languages", []):
        try:
            repos = fetch_trending(lang, cfg)
            lang_all.extend(repos[: cfg.get("top_n", 3)])
            logger.info("抓取 %s 成功，获 %d 条", lang, len(repos))
        except Exception as e:
            logger.error("抓取语言 %s 失败：%s", lang, e)

    lang_all.sort(key=lambda r: r["stars_today"] or 0, reverse=True)

    # 2) AI Agent 桶
    ai_all = []
    try:
        ai_all = fetch_ai_agent(cfg)
        logger.info("抓取 AI Agent 成功，获 %d 条", len(ai_all))
    except Exception as e:
        logger.error("抓取 AI Agent 失败：%s", e)

    # 3) 去重合并（AI 桶排除已在语言桶出现的）
    seen = {r["repo_path"] for r in lang_all}
    ai_unique = [r for r in ai_all if r["repo_path"] not in seen]

    # 3.5) 抓取全失败时终止，避免生成空博文（CI 据此判断失败）
    if not lang_all and not ai_unique:
        logger.error("所有抓取均失败，未获取到任何项目，终止（不生成空博文）")
        return 1

    # 4) 渲染并写入
    md = render_markdown(today, lang_all, ai_unique)
    try:
        post_path.write_text(md, encoding="utf-8")
    except PermissionError:
        # 目标文件可能被占用或设为只读（如被编辑器打开 / git 设为只读），清除只读后重试一次
        try:
            os.chmod(post_path, stat.S_IWRITE)
            post_path.write_text(md, encoding="utf-8")
        except OSError as e2:
            logger.error("写入博文失败（权限/占用）：%s — %s", post_path, e2)
            raise
    logger.info("已生成博文：%s（语言桶 %d 条，AI 桶 %d 条）", post_path, len(lang_all), len(ai_unique))
    return 0


if __name__ == "__main__":
    sys.exit(main())
