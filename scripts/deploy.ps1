# 部署 public/ 到 gh-pages 分支（force push）
# 用法：pwsh scripts/deploy.ps1
# 说明：绕过 hexo-deployer-git（npm 权限问题），直接用 git 推送生成的静态站点到 gh-pages。
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PubDir   = Join-Path $ScriptDir "public"
$Remote   = "git@github.com:panninan/panninan.github.io.git"

if (-not (Test-Path $PubDir)) {
    Write-Host "未找到 public/，先执行 hexo generate"
    & "$ScriptDir/node_modules/.bin/hexo" generate
}

Push-Location $PubDir
try {
    if (-not (Test-Path ".git")) {
        git init -q
        git checkout -b gh-pages
        git remote add origin $Remote
    } else {
        git checkout -q gh-pages 2>$null
    }
    git add -A
    $date = Get-Date -Format "yyyy-MM-dd"
    $changed = git diff --cached --name-only
    if (-not $changed) {
        Write-Host "无内容变更，跳过提交"
    } else {
        git commit -q -m "deploy: $date"
        git push --force origin HEAD:gh-pages
        Write-Host "已推送到 gh-pages 分支"
    }
} finally {
    Pop-Location
}
