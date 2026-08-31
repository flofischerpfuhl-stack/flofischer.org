param(
  [string]$Voice = "Microsoft Stefan",
  [int]$Rate = 1
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$studioRoot = Split-Path -Parent $PSScriptRoot
$outputPath = Join-Path $studioRoot "public\audio\voice-de.wav"
$eszett = [char]0x00DF
$text = "Wenn Gott schon heute wei$($eszett), was du morgen entscheidest, bist du dann wirklich frei? Genau hier beginnt das Problem von Vorsehung und freiem Willen. Der Artikel zeigt, wo klassische Antworten an Grenzen sto$($eszett)en, und warum Gottes Wissen vielleicht ganz anders gedacht werden muss."

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice($Voice)
$synth.Rate = $Rate
$synth.Volume = 100
$synth.SetOutputToWaveFile($outputPath)
$synth.Speak($text)
$synth.Dispose()

Write-Output $outputPath
