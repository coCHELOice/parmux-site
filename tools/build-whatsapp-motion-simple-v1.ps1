param(
    [string]$Ffmpeg = "ffmpeg"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$hero = Join-Path $repoRoot "assets\parmux-orchestrator-hero.png"
$output = Join-Path $repoRoot "assets\whatsapp-orchestrator-motion-simple-v1.mp4"

if (-not (Test-Path -LiteralPath $hero)) {
    throw "Missing required asset: $hero"
}

$filter = @"
[0:v]scale=1280:720,format=rgba,eq=brightness='0.008*sin(2*PI*t/7)':eval=frame[base];
color=c=0x8fff2d@0.0:s=92x92:d=7,format=rgba,geq=r=143:g=255:b=45:a='60*(0.5+0.5*sin(2*PI*T/1.75))*between(hypot(X-46,Y-46),30,42)'[corepulse];
color=c=0x58bfff@0.78:s=24x4:d=7,format=rgba[bluepulse];
color=c=0xb747ff@0.80:s=24x4:d=7,format=rgba[purplepulse];
color=c=0x8fff2d@0.80:s=24x4:d=7,format=rgba[greenpulse];
color=c=0x58bfff@0.88:s=7x7:d=7,format=rgba[orbitblue];
color=c=0xb747ff@0.88:s=7x7:d=7,format=rgba[orbitpurple];
color=c=0x8fff2d@0.88:s=7x7:d=7,format=rgba[orbitgreen];
[base][corepulse]overlay=x=580:y=392:shortest=1[withcore];
[withcore][bluepulse]overlay=x='420+mod(t*(190/1.75),190)':y=419:eval=frame:shortest=1[withblue];
[withblue][purplepulse]overlay=x='420+mod(t*(190/(7/3))+63,190)':y=449:eval=frame:shortest=1[withpurple];
[withpurple][greenpulse]overlay=x='420+mod(t*(190/1.4)+126,190)':y=477:eval=frame:shortest=1[withgreen];
[withgreen][orbitblue]overlay=x='622+29*cos(2*PI*t/3.5)':y='433+29*sin(2*PI*t/3.5)':eval=frame:shortest=1[withorbit1];
[withorbit1][orbitpurple]overlay=x='622+29*cos(2*PI*t/3.5+2.094)':y='433+29*sin(2*PI*t/3.5+2.094)':eval=frame:shortest=1[withorbit2];
[withorbit2][orbitgreen]overlay=x='622+29*cos(2*PI*t/3.5+4.189)':y='433+29*sin(2*PI*t/3.5+4.189)':eval=frame:shortest=1,
drawbox=x=820:y=355:w=5:h=5:color=0x8fff2d@0.84:t=fill:enable='lt(mod(t,0.70),0.16)',
drawbox=x=841:y=355:w=5:h=5:color=0x58bfff@0.84:t=fill:enable='between(mod(t,0.70),0.16,0.32)',
drawbox=x=861:y=355:w=5:h=5:color=0xb747ff@0.84:t=fill:enable='between(mod(t,0.70),0.32,0.48)',
drawbox=x=930:y=434:w=5:h=5:color=0x8fff2d@0.84:t=fill:enable='lt(mod(t,0.70),0.20)',
drawbox=x=947:y=434:w=5:h=5:color=0x58bfff@0.84:t=fill:enable='between(mod(t,0.70),0.20,0.40)',
format=yuv420p[outv]
"@ -replace "`r", "" -replace "`n", ""

& $Ffmpeg `
    -hide_banner `
    -loglevel warning `
    -y `
    -loop 1 `
    -framerate 30 `
    -t 7 `
    -i $hero `
    -filter_complex $filter `
    -map "[outv]" `
    -an `
    -r 30 `
    -c:v libx264 `
    -profile:v high `
    -level 4.0 `
    -preset medium `
    -crf 21 `
    -movflags +faststart `
    $output

if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg failed with exit code $LASTEXITCODE"
}

$result = Get-Item -LiteralPath $output
[PSCustomObject]@{
    Path = $result.FullName
    Bytes = $result.Length
    Megabytes = [math]::Round($result.Length / 1MB, 2)
}
