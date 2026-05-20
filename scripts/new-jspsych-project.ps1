<#
.SYNOPSIS
  从本仓库根模板复制出一个新的独立子项目到 projects/<Name>/。
  每个子项目需单独在其目录执行 npm install，拥有独立 node_modules。

.EXAMPLE
  .\scripts\new-jspsych-project.ps1 -Name "MyStudy"
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$Name
)

$ErrorActionPreference = "Stop"

$TemplateRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ProjectsDir = Join-Path $TemplateRoot "projects"
$DestRoot = Join-Path $ProjectsDir $Name

if ($Name -match '[\\/:*?"<>|]' -or $Name.Trim().Length -eq 0) {
  throw "名称不能包含路径非法字符或为空。"
}
if (Test-Path $DestRoot) {
  throw "已存在目录，请换名称或先删除: $DestRoot"
}

New-Item -ItemType Directory -Path $DestRoot -Force | Out-Null

# /E 递归；排除大目录与兄弟子项目，避免把已有 projects 拷进新项目
$xd = @("node_modules", "dist", ".git", "projects", ".cursor")
$xdArgs = ($xd | ForEach-Object { "/XD"; $_ })
$null = & robocopy $TemplateRoot $DestRoot /E @xdArgs /NFL /NDL /NJH /NJS /nc /ns /np
if ($LASTEXITCODE -ge 8) {
  throw "复制失败 (robocopy 退出码 $LASTEXITCODE)。若本机无 robocopy，请用手动复制方式，见 projects/README.md"
}

# 子项目不应再内含一份 scripts（避免混淆）；保留由根模板维护脚本即可
$NestedScripts = Join-Path $DestRoot "scripts"
if (Test-Path $NestedScripts) {
  Remove-Item -Recurse -Force $NestedScripts
}

$pkgPath = Join-Path $DestRoot "package.json"
if (Test-Path $pkgPath) {
  $slug = ($Name -creplace "[^a-zA-Z0-9-]", "-").Trim("-").ToLowerInvariant()
  if ([string]::IsNullOrEmpty($slug)) { $slug = "study" }
  $c = Get-Content -Path $pkgPath -Raw -Encoding UTF8
  $c = $c -replace '"name"\s*:\s*"[^"]*"', "`"name`": `"study-$slug`""
  Set-Content -Path $pkgPath -Value $c -Encoding UTF8 -NoNewline
}

Write-Host "已创建: $DestRoot"
Write-Host "下一步:"
Write-Host "  cd `"$DestRoot`""
Write-Host "  npm install"
Write-Host "  npm run dev"
