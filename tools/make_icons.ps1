# 由 release/art/icon-source.png 生成 PWA 图标（docs/icons/）
# 用法：powershell -File tools/make_icons.ps1
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $root 'release\art\icon-source.png'
$out  = Join-Path $root 'docs\icons'
New-Item -ItemType Directory -Path $out -Force | Out-Null

# 源图四周有一圈纯黑圆角边框，向内裁掉一片，得到干净的可裁切画面
$inset = 132
$img = [System.Drawing.Image]::FromFile($src)
$cropW = $img.Width - 2 * $inset
$cropH = $img.Height - 2 * $inset
$crop = New-Object System.Drawing.Bitmap $cropW, $cropH
$g = [System.Drawing.Graphics]::FromImage($crop)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $cropW, $cropH),
                  (New-Object System.Drawing.Rectangle $inset, $inset, $cropW, $cropH),
                  [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$img.Dispose()

function Save-Png([System.Drawing.Image]$image, [int]$size, [string]$name) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $gb = [System.Drawing.Graphics]::FromImage($bmp)
  $gb.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gb.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $gb.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $gb.DrawImage($image, 0, 0, $size, $size)
  $gb.Dispose()
  $path = Join-Path $out $name
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  "$name : $size x $size"
}

# 普通图标（any purpose）：整张铺满
foreach ($s in 512, 384, 192, 180, 64, 32) { Save-Png $crop $s "icon-$s.png" }
Copy-Item -LiteralPath (Join-Path $out 'icon-180.png') -Destination (Join-Path $out 'apple-touch-icon.png') -Force
Copy-Item -LiteralPath (Join-Path $out 'icon-32.png')  -Destination (Join-Path $out 'favicon-32.png') -Force

# maskable：内容缩到 88% 居中，四周用同一张图放大后的画面补齐，圆形裁切时不会切到主体
$size = 512
$bmp = New-Object System.Drawing.Bitmap $size, $size
$gb = [System.Drawing.Graphics]::FromImage($bmp)
$gb.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gb.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$gb.DrawImage($crop, (New-Object System.Drawing.Rectangle 0, 0, $size, $size))   # 放大铺底
$inner = [int]($size * 0.80)
$off = [int](($size - $inner) / 2)
$gb.DrawImage($crop, (New-Object System.Drawing.Rectangle $off, $off, $inner, $inner))
$gb.Dispose()
$bmp.Save((Join-Path $out 'maskable-512.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
'maskable-512.png : 512 x 512'
$crop.Dispose()
Get-ChildItem -LiteralPath $out -Filter *.png | Select-Object Name, Length | Format-Table -AutoSize
