param(
  [string]$ProjectSlug = "vorsehung-freier-wille",
  [string]$ScriptVersion = "v002",
  [string]$Language = "de",
  [string]$Voice = "Microsoft Stefan",
  [int]$Rate = 1,
  [string]$OutputFile = ""
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$studioRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $studioRoot "projects\$ProjectSlug\scripts\$ScriptVersion.$Language.md"
if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Script not found: $scriptPath"
}

$script = Get-Content -Raw -LiteralPath $scriptPath
$match = [regex]::Match($script, '(?ms)^## Voice-over\s+(.*?)\s+^## ')
if (-not $match.Success) {
  throw "Voice-over section not found in $scriptPath"
}
$text = ($match.Groups[1].Value.Trim() -replace '\r?\n', ' ')

if ([string]::IsNullOrWhiteSpace($OutputFile)) {
  $OutputFile = Join-Path $studioRoot "public\audio\$ProjectSlug-$ScriptVersion-$Language.wav"
}
$outputDirectory = Split-Path -Parent $OutputFile
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice($Voice)
$synth.Rate = $Rate
$synth.Volume = 100
$synth.SetOutputToWaveFile($OutputFile)
$synth.Speak($text)
$synth.Dispose()

Write-Output $OutputFile
