$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$destination = Join-Path $PSScriptRoot '..\icons'
[System.IO.Directory]::CreateDirectory($destination) | Out-Null

foreach ($asset in @(
    @{ Name = 'icon-192.png'; Size = 192 },
    @{ Name = 'icon-512.png'; Size = 512 },
    @{ Name = 'maskable-512.png'; Size = 512 },
    @{ Name = 'apple-touch-icon.png'; Size = 180 }
)) {
    $bitmap = [System.Drawing.Bitmap]::new($asset.Size, $asset.Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#f7f4ef'))
    $graphics.ScaleTransform($asset.Size / 512.0, $asset.Size / 512.0)
    $accent = [System.Drawing.ColorTranslator]::FromHtml('#b11f4b')
    $background = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#f7f4ef'))
    $dark = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#242424'))
    $brush = [System.Drawing.SolidBrush]::new($accent)
    $pen = [System.Drawing.Pen]::new($accent, 11)
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $orbit = [System.Drawing.Pen]::new($accent, 6)
    $border = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#dedede'), 3)
    $graphics.DrawEllipse($border, 102, 102, 308, 308)
    $state = $graphics.Save()
    $graphics.TranslateTransform(256, 256)
    $graphics.RotateTransform(-28)
    $graphics.DrawEllipse($orbit, -168, -57, 336, 114)
    $graphics.Restore($state)

    $body = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $body.AddBezier(149, 256, 197, 170, 285, 170, 337, 256)
    $body.AddBezier(337, 256, 285, 342, 197, 342, 149, 256)
    $body.CloseFigure()
    $graphics.FillPath($background, $body)
    $graphics.DrawPath($pen, $body)
    $tail = [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new(337, 256),
        [System.Drawing.PointF]::new(377, 209),
        [System.Drawing.PointF]::new(377, 303)
    )
    $graphics.FillPolygon($background, $tail)
    $graphics.DrawPolygon($pen, $tail)
    $fin = [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new(214, 201),
        [System.Drawing.PointF]::new(247, 169),
        [System.Drawing.PointF]::new(284, 201)
    )
    $graphics.FillPolygon($background, $fin)
    $graphics.DrawLines($pen, $fin)
    $graphics.FillEllipse($dark, 185, 236, 18, 18)
    $graphics.FillEllipse($brush, 353, 150, 23, 23)
    $bitmap.Save((Join-Path $destination $asset.Name), [System.Drawing.Imaging.ImageFormat]::Png)
    $body.Dispose()
    $border.Dispose()
    $orbit.Dispose()
    $pen.Dispose()
    $brush.Dispose()
    $dark.Dispose()
    $background.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}
Write-Output 'Generated four local PWA icons.'
