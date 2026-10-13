$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$destination = Join-Path $root 'icons'
[xml]$source = [System.IO.File]::ReadAllText((Join-Path $root 'icon.svg'))
$namespace = [System.Xml.XmlNamespaceManager]::new($source.NameTable)
$namespace.AddNamespace('svg', 'http://www.w3.org/2000/svg')
$pathNodes = @($source.SelectNodes('/svg:svg/svg:g[@id="enso-mark"]/svg:path', $namespace))
if ($pathNodes.Count -ne 2) { throw 'icon.svg must contain the two filled Enso paths.' }
$style = $source.SelectSingleNode('/svg:svg/svg:style', $namespace).InnerText
$palette = @{}
foreach ($name in @('bg', 'accent')) {
    $match = [regex]::Match($style, "--cp-${name}:\s*(#[0-9a-fA-F]{6})")
    if (!$match.Success) { throw "icon.svg is missing its default --cp-$name color." }
    $palette[$name] = [System.Drawing.ColorTranslator]::FromHtml($match.Groups[1].Value)
}

function ConvertTo-LogoPath([string]$data) {
    if (!$data.TrimStart().StartsWith('M') -or [regex]::IsMatch($data, '[^MCLZ0-9.,\s-]')) {
        throw 'Enso paths must use absolute M, C, L, and Z commands.'
    }
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $point = [System.Drawing.PointF]::new(0, 0)
    $arity = @{ M = 2; C = 6; L = 2; Z = 0 }
    foreach ($segment in [regex]::Matches($data, '([MCLZ])([^MCLZ]*)')) {
        $command = $segment.Groups[1].Value
        [single[]]$values = @([regex]::Matches($segment.Groups[2].Value, '-?\d+(?:\.\d+)?') | ForEach-Object {
            [single]::Parse($_.Value, [System.Globalization.CultureInfo]::InvariantCulture)
        })
        if ($values.Count -ne $arity[$command]) {
            $path.Dispose()
            throw "Unexpected coordinates for Enso path command $command."
        }
        switch ($command) {
            'M' { $path.StartFigure(); $point = [System.Drawing.PointF]::new($values[0], $values[1]) }
            'C' {
                $path.AddBezier($point.X, $point.Y, $values[0], $values[1], $values[2], $values[3], $values[4], $values[5])
                $point = [System.Drawing.PointF]::new($values[4], $values[5])
            }
            'L' {
                $path.AddLine($point.X, $point.Y, $values[0], $values[1])
                $point = [System.Drawing.PointF]::new($values[0], $values[1])
            }
            'Z' { $path.CloseFigure() }
        }
    }
    return $path
}

$paths = @($pathNodes | ForEach-Object { ConvertTo-LogoPath ($_.GetAttribute('d')) })
$background = [System.Drawing.SolidBrush]::new($palette.bg)
$accent = [System.Drawing.SolidBrush]::new($palette.accent)
$rounded = [System.Drawing.Drawing2D.GraphicsPath]::new()
$rounded.AddArc(0, 0, 208, 208, 180, 90)
$rounded.AddArc(304, 0, 208, 208, 270, 90)
$rounded.AddArc(304, 304, 208, 208, 0, 90)
$rounded.AddArc(0, 304, 208, 208, 90, 90)
$rounded.CloseFigure()

try {
    $indexPath = Join-Path $root 'index.html'
    $html = [System.IO.File]::ReadAllText($indexPath)
    $pattern = '<symbol id="i-enso"[^>]*>[\s\S]*?</symbol>'
    if ([regex]::Matches($html, $pattern).Count -ne 1) { throw 'index.html must have one inline i-enso symbol.' }
    $markup = ($pathNodes | ForEach-Object { '<path d="' + $_.GetAttribute('d') + '"/>' }) -join ''
    $symbol = '<symbol id="i-enso" viewBox="64 64 384 384" fill="currentColor" stroke="none">' + $markup + '</symbol>'
    $updated = [regex]::Replace($html, $pattern, $symbol)
    if ($updated -cne $html) {
        [System.IO.File]::WriteAllText($indexPath, $updated, [System.Text.UTF8Encoding]::new($false))
    }
    [System.IO.Directory]::CreateDirectory($destination) | Out-Null
    foreach ($asset in @(
        @{ Name = 'favicon-32.png'; Size = 32; Scale = 1.08; Rounded = $true },
        @{ Name = 'icon-192.png'; Size = 192; Scale = 1; Rounded = $true },
        @{ Name = 'icon-512.png'; Size = 512; Scale = 1; Rounded = $true },
        @{ Name = 'maskable-512.png'; Size = 512; Scale = 0.9; Rounded = $false },
        @{ Name = 'apple-touch-icon.png'; Size = 180; Scale = 1; Rounded = $false }
    )) {
        $sampleSize = $asset.Size * 2
        $bitmap = [System.Drawing.Bitmap]::new($sampleSize, $sampleSize)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $output = [System.Drawing.Bitmap]::new($asset.Size, $asset.Size)
        $outputGraphics = [System.Drawing.Graphics]::FromImage($output)
        try {
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.Clear([System.Drawing.Color]::Transparent)
            $graphics.ScaleTransform($sampleSize / 512.0, $sampleSize / 512.0)
            if ($asset.Rounded) { $graphics.FillPath($background, $rounded) }
            else { $graphics.FillRectangle($background, 0, 0, 512, 512) }
            $graphics.TranslateTransform(256, 256)
            $graphics.ScaleTransform($asset.Scale, $asset.Scale)
            $graphics.TranslateTransform(-256, -256)
            foreach ($path in $paths) { $graphics.FillPath($accent, $path) }
            $outputGraphics.Clear($(if ($asset.Rounded) { [System.Drawing.Color]::Transparent } else { $palette.bg }))
            $outputGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
            $outputGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $outputGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $outputGraphics.DrawImage($bitmap, 0, 0, $asset.Size, $asset.Size)
            $output.Save((Join-Path $destination $asset.Name), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally {
            $outputGraphics.Dispose()
            $output.Dispose()
            $graphics.Dispose()
            $bitmap.Dispose()
        }
    }
} finally {
    $rounded.Dispose()
    $accent.Dispose()
    $background.Dispose()
    foreach ($path in $paths) { $path.Dispose() }
}
Write-Output 'Generated five Enso favicon/install icons and synchronized the inline logo.'
