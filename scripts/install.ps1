# Installs the newest release of the edu-sharing i18n extension into the VS Code editors of this computer: VS Code,
# VS Code Insiders, VSCodium, Cursor and Windsurf, each whose command line is on PATH (VS Code, Insiders and VSCodium
# also in their default folders). Works from PowerShell, cmd.exe and the Run dialog:
#
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://github.com/janschachtschabel/i18n-translator-vscode/releases/latest/download/install.ps1 | iex"
#
# Optional environment variables:
#   EDU_I18N_VSIX     a .vsix file to install instead of downloading the newest release
#   EDU_I18N_EDITORS  the editor commands to install into, separated by ";" (default: every editor found)

function Install-EduSharingI18n {
  $ErrorActionPreference = 'Stop'
  # Windows PowerShell 5.1 downloads slowly while it draws a progress bar, and older systems lack TLS 1.2 by default.
  $ProgressPreference = 'SilentlyContinue'
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $release = 'https://github.com/janschachtschabel/i18n-translator-vscode/releases/latest/download/edu-sharing-i18n.vsix'

  $editors = @(Find-Editors)
  if ($editors.Count -eq 0) {
    Write-Host 'No VS Code editor found (code, code-insiders, codium, cursor, windsurf).'
    Write-Host "Install VS Code from https://code.visualstudio.com, or download $release"
    Write-Host "and choose 'Extensions: Install from VSIX...' in your editor."
    throw 'Nothing was installed.'
  }

  $vsix = $env:EDU_I18N_VSIX
  if (-not $vsix) {
    $vsix = Join-Path ([System.IO.Path]::GetTempPath()) 'edu-sharing-i18n.vsix'
    Write-Host "Downloading $release"
    Invoke-WebRequest -Uri $release -OutFile $vsix -UseBasicParsing
  }

  $failed = @()
  foreach ($editor in $editors) {
    Write-Host "Installing into $editor"
    & $editor --install-extension $vsix --force
    if ($LASTEXITCODE -ne 0) {
      $failed += $editor
    }
  }
  if ($failed.Count -gt 0) {
    throw "Installing failed for: $($failed -join ', ')"
  }
  Write-Host 'Done. In windows that are open, run "Developer: Reload Window"; then open an edu-sharing checkout.'
}

# The command lines of the editors: those named in EDU_I18N_EDITORS, else every one on PATH or in a default folder.
function Find-Editors {
  if ($env:EDU_I18N_EDITORS) {
    return $env:EDU_I18N_EDITORS -split ';' | Where-Object { $_ }
  }
  $found = [ordered]@{}
  foreach ($name in 'code', 'code-insiders', 'codium', 'cursor', 'windsurf') {
    $command = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) {
      $found[$name] = $command.Source
    }
  }
  $folders = [ordered]@{
    'code'          = 'Microsoft VS Code\bin\code.cmd'
    'code-insiders' = 'Microsoft VS Code Insiders\bin\code-insiders.cmd'
    'codium'        = 'VSCodium\bin\codium.cmd'
  }
  foreach ($name in $folders.Keys) {
    foreach ($base in (Join-Path $env:LOCALAPPDATA 'Programs'), $env:ProgramFiles) {
      $path = Join-Path $base $folders[$name]
      if (-not $found.Contains($name) -and (Test-Path $path)) {
        $found[$name] = $path
      }
    }
  }
  return $found.Values
}

Install-EduSharingI18n
