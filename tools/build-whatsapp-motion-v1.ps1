param(
    [string]$Ffmpeg = "ffmpeg"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$hero = Join-Path $repoRoot "assets\parmux-orchestrator-hero.png"
$sprites = Join-Path $repoRoot "assets\whatsapp-worker-walk-sprites-v1.png"
$output = Join-Path $repoRoot "assets\whatsapp-orchestrator-motion-v1.mp4"

foreach ($requiredFile in @($hero, $sprites)) {
    if (-not (Test-Path -LiteralPath $requiredFile)) {
        throw "Missing required asset: $requiredFile"
    }
}

$filter = @"
[0:v]scale=1280:720,format=rgba,eq=brightness='0.010*sin(2*PI*t/2.8)':eval=frame[base];
[1:v]format=rgba,colorkey=0xff00ff:0.24:0.08,crop=w=iw/4:h=ih/2:x='mod(floor(t*8),4)*iw/4':y='floor(mod(floor(t*8),8)/4)*ih/2',scale=-1:154,fade=t=in:st=0:d=0.35:alpha=1,fade=t=out:st=6.55:d=0.45:alpha=1[walker];
color=c=0x8fff2d@0.0:s=92x92:d=7,format=rgba,geq=r=143:g=255:b=45:a='66*(0.5+0.5*sin(2*PI*T/1.8))*between(hypot(X-46,Y-46),30,42)'[corepulse];
color=c=0x58bfff@0.80:s=28x5:d=7,format=rgba[bluepulse];
color=c=0xb747ff@0.82:s=28x5:d=7,format=rgba[purplepulse];
color=c=0x8fff2d@0.82:s=28x5:d=7,format=rgba[greenpulse];
[base][corepulse]overlay=x=580:y=392:shortest=1[withcore];
[withcore][bluepulse]overlay=x='420+mod(t*108,190)':y=419:eval=frame:shortest=1[withblue];
[withblue][purplepulse]overlay=x='420+mod(t*96+58,190)':y=449:eval=frame:shortest=1[withpurple];
[withpurple][greenpulse]overlay=x='420+mod(t*116+112,190)':y=477:eval=frame:shortest=1[withpipes];
[withpipes][walker]overlay=x='-154+(W+308)*t/7':y='H-h-36':eval=frame:shortest=1,
drawbox=x=820:y=355:w=6:h=6:color=0x8fff2d@0.90:t=fill:enable='lt(mod(t,1.10),0.22)',
drawbox=x=841:y=355:w=6:h=6:color=0x58bfff@0.88:t=fill:enable='between(mod(t,1.10),0.22,0.44)',
drawbox=x=861:y=355:w=6:h=6:color=0xb747ff@0.88:t=fill:enable='between(mod(t,1.10),0.44,0.66)',
drawbox=x=930:y=434:w=5:h=5:color=0x8fff2d@0.90:t=fill:enable='lt(mod(t,0.90),0.24)',
drawbox=x=947:y=434:w=5:h=5:color=0x58bfff@0.90:t=fill:enable='between(mod(t,0.90),0.24,0.48)',
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
    -loop 1 `
    -framerate 30 `
    -t 7 `
    -i $sprites `
    -filter_complex $filter `
    -map "[outv]" `
    -an `
    -r 30 `
    -c:v libx264 `
    -profile:v high `
    -level 4.0 `
    -preset medium `
    -crf 22 `
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
