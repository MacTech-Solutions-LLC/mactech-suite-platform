Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$requiredPaths = @(
    "README.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/ISSUE_TEMPLATE/task.yml",
    ".github/ISSUE_TEMPLATE/risk-review.yml",
    ".github/workflows/repo-hygiene.yml",
    "docs/00-command-center/README.md",
    "docs/01-governance/repo-governance.md",
    "docs/02-security-model/security-model.md",
    "docs/03-qms-readiness/qms-readiness-notes.md",
    "docs/04-evidence/evidence-index.md",
    "docs/05-architecture/platform-architecture.md",
    "docs/06-decisions/ADR-0001-workflow-foundation.md",
    ".codex/prompts/README.md",
    ".codex/prompts/review-current-changes.md",
    ".codex/prompts/create-small-slice.md",
    ".codex/prompts/security-safe-editing.md"
)

$missing = @()
foreach ($path in $requiredPaths) {
    if (-not (Test-Path -LiteralPath $path)) {
        $missing += $path
    }
}

if ($missing.Count -gt 0) {
    Write-Error ("Missing required foundation paths:`n" + ($missing -join "`n"))
}

$workflowFiles = Get-ChildItem -Path ".github/workflows" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in @(".yml", ".yaml") }
foreach ($workflow in $workflowFiles) {
    $content = Get-Content -Raw -LiteralPath $workflow.FullName
    if ($content -match "(?im)^\s*(deploy|deployment)\s*:") {
        Write-Error "Workflow appears to define a deployment job or key: $($workflow.FullName)"
    }
}

$forbiddenPatterns = @(
    ("BEGIN " + "RSA PRIVATE KEY"),
    ("BEGIN " + "OPENSSH PRIVATE KEY"),
    ("AWS" + "_SECRET_ACCESS_KEY"),
    ("PRIVATE" + "_KEY=")
)

$textFiles = Get-ChildItem -Path "." -Recurse -File -Force |
    Where-Object {
        $_.FullName -notmatch "[/\\]\.git[/\\]" -and
        $_.FullName -notmatch "[/\\]node_modules[/\\]" -and
        $_.Extension -in @(".md", ".yml", ".yaml", ".ps1", ".txt", "")
    }

foreach ($file in $textFiles) {
    $content = Get-Content -Raw -LiteralPath $file.FullName -ErrorAction SilentlyContinue
    foreach ($pattern in $forbiddenPatterns) {
        if ($content -like "*$pattern*") {
            Write-Error "Potential secret marker found in $($file.FullName): $pattern"
        }
    }
}

Write-Host "Repo hygiene checks passed."
