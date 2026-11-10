$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$assetsPath = Join-Path $projectRoot "assets"
$iconSizes = @(16, 24, 32, 48, 64, 128, 256)
$pngImages = [System.Collections.Generic.List[byte[]]]::new()

$source = [System.Drawing.Bitmap]::new(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($source)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.ScaleTransform(4, 4)

$backgroundPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
$backgroundPath.AddArc(12, 12, 108, 108, 180, 90)
$backgroundPath.AddArc(136, 12, 108, 108, 270, 90)
$backgroundPath.AddArc(136, 136, 108, 108, 0, 90)
$backgroundPath.AddArc(12, 136, 108, 108, 90, 90)
$backgroundPath.CloseFigure()
$backgroundBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(23, 23, 25))
$borderPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(56, 56, 61), 2)
$graphics.FillPath($backgroundBrush, $backgroundPath)
$graphics.DrawPath($borderPen, $backgroundPath)

$letterPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
$letterPath.StartFigure()
$letterPath.AddLine(75, 74, 186, 74)
$letterPath.AddLine(186, 74, 186, 157)
$letterPath.AddBezier(186, 157, 186, 191, 169, 209, 137, 209)
$letterPath.AddBezier(137, 209, 112, 209, 94, 197, 85, 175)
$letterPath.AddLine(85, 175, 109, 163)
$letterPath.AddBezier(109, 163, 114, 176, 123, 183, 137, 183)
$letterPath.AddBezier(137, 183, 154, 183, 161, 174, 161, 157)
$letterPath.AddLine(161, 157, 161, 100)
$letterPath.AddLine(161, 100, 75, 100)
$letterPath.CloseFigure()
$whiteBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
$graphics.FillPath($whiteBrush, $letterPath)

$accentPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
$accentPath.AddPolygon([System.Drawing.Point[]]@(
  [System.Drawing.Point]::new(166, 233),
  [System.Drawing.Point]::new(181, 233),
  [System.Drawing.Point]::new(206, 206),
  [System.Drawing.Point]::new(191, 206)
))
$accentBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(223, 38, 53))
$graphics.FillPath($accentBrush, $accentPath)

foreach ($size in $iconSizes) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $smallGraphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $smallGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $smallGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $smallGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $smallGraphics.DrawImage($source, 0, 0, $size, $size)
  $smallGraphics.Dispose()

  $stream = [System.IO.MemoryStream]::new()
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngImages.Add($stream.ToArray())
  if ($size -eq 256) {
    $preview = [System.Drawing.Bitmap]::new($source, 512, 512)
    $preview.Save((Join-Path $assetsPath "j-iports.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $preview.Dispose()
  }
  $stream.Dispose()
  $bitmap.Dispose()
}

$iconStream = [System.IO.MemoryStream]::new()
$writer = [System.IO.BinaryWriter]::new($iconStream)
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]$iconSizes.Count)
$imageOffset = 6 + (16 * $iconSizes.Count)

for ($index = 0; $index -lt $iconSizes.Count; $index++) {
  $size = $iconSizes[$index]
  $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
  $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]32)
  $writer.Write([UInt32]$pngImages[$index].Length)
  $writer.Write([UInt32]$imageOffset)
  $imageOffset += $pngImages[$index].Length
}

foreach ($image in $pngImages) { $writer.Write($image) }
$writer.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $assetsPath "j-iports.ico"), $iconStream.ToArray())

$writer.Dispose()
$iconStream.Dispose()
$graphics.Dispose()
$source.Dispose()
$backgroundPath.Dispose()
$letterPath.Dispose()
$accentPath.Dispose()
$backgroundBrush.Dispose()
$borderPen.Dispose()
$whiteBrush.Dispose()
$accentBrush.Dispose()

Write-Output "Generated assets/j-iports.ico and assets/j-iports.png"
